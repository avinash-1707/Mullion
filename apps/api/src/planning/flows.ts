import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  JsonlAccumulator,
  analystQuestionAgent,
  analystRequirementsAgent,
  buildEditMessages,
  buildInitialPlanMessages,
  checkBudget,
  checkGraphStructure,
  consistencyReviewAgent,
  plannedDecisionSchema,
  plannerEditLineSchema,
  runAgent,
  withBackoff,
  type AnsweredRound,
  type PlannedDecision,
} from "@mullion/agents";
import { schema, type Tx } from "@mullion/db";
import type { CostContext } from "@mullion/llm";
import {
  mcqAnswerSchema,
  mcqQuestionSchema,
  type AgentTask,
  type ConsistencyResult,
  type McqAnswer,
  type RequirementsDoc,
} from "@mullion/schemas";
import { z } from "zod";
import { db } from "../db.js";
import { env } from "../env.js";
import { llm } from "../llm.js";
import {
  bumpGraphVersion,
  claimAgent,
  failAgent,
  finishAgent,
  publishPlanningEvent,
  toDecisionEntry,
  toGraphEdge,
  toGraphNode,
  toMcqRound,
  toRequirementsVersion,
  type SessionRow,
} from "./state.js";

// ---------------------------------------------------------------------------
// Background agent flows (02 §2.2–2.4). Each public runX claims the
// session's agent slot, does its work, and releases it — a terminal failure
// parks the task on the row for the manual "try again" (ADR-30).
// ---------------------------------------------------------------------------

function costContext(session: SessionRow): CostContext {
  return {
    organizationId: session.organizationId,
    userId: session.userId,
    sessionId: session.id,
  };
}

function actorFor(task: AgentTask): string {
  return task.kind === "consistency_check"
    ? "reviewer"
    : task.kind === "plan_architecture" || task.kind === "edit_prompt"
      ? "planner"
      : "analyst";
}

/**
 * Per-org spend gate before any paid planning work. As of M2 this delegates
 * to the ADR-31 combined circuit breaker (`checkBudget`) so planning and
 * build share ONE breaker instead of ADR-43's separate stopgap — same org
 * rolling-window ceiling, one implementation.
 */
export async function isOrgBudgetExhausted(organizationId: string): Promise<boolean> {
  const status = await checkBudget(db, {
    organizationId,
    config: { orgBudgetUsd: env.ORG_DAILY_LLM_BUDGET_USD },
  });
  return !status.ok;
}

export type StartAgentResult = "started" | "busy" | "budget_exhausted";

/**
 * Claims the session's agent slot synchronously (so callers can 409 a
 * concurrent request instead of silently dropping it), then runs the flow
 * in the background.
 */
export async function startAgentTask(
  session: SessionRow,
  task: AgentTask,
): Promise<StartAgentResult> {
  if (await isOrgBudgetExhausted(session.organizationId)) {
    return "budget_exhausted";
  }
  const actor = actorFor(task);
  const claimed = await claimAgent(db, session, task, actor);
  if (!claimed) return "busy";
  runClaimedTask(session, task);
  return "started";
}

/**
 * Background execution for a session whose agent slot the caller already
 * claimed (startAgentTask, or proceed's atomic phase+claim update).
 */
export function runClaimedTask(session: SessionRow, task: AgentTask): void {
  const actor = actorFor(task);
  void (async () => {
    try {
      await runTask(session, task);
      await finishAgent(db, session, actor);
    } catch (error) {
      console.error(`Agent task ${task.kind} failed for session ${session.id}:`, error);
      await failAgent(db, session, actor, error).catch((publishError) => {
        console.error(`Failed to record agent failure for ${session.id}:`, publishError);
      });
    }
  })();
}

async function runTask(session: SessionRow, task: AgentTask): Promise<void> {
  switch (task.kind) {
    case "question_round":
      await runQuestionRound(session, task.round === 1 ? 1 : 2);
      return;
    case "requirements_doc":
      await runRequirementsDoc(session);
      return;
    case "plan_architecture":
      await runInitialPlan(session);
      return;
    case "edit_prompt":
      await runEditPrompt(session, task.prompt);
      return;
    case "consistency_check":
      await runConsistencyCheck(session);
      return;
    default: {
      const exhaustive: never = task;
      throw new Error(`Unhandled agent task ${JSON.stringify(exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Analyst
// ---------------------------------------------------------------------------

async function loadAnsweredRounds(sessionId: string): Promise<AnsweredRound[]> {
  const rows = await db
    .select()
    .from(schema.mcqRounds)
    .where(eq(schema.mcqRounds.sessionId, sessionId))
    .orderBy(asc(schema.mcqRounds.round));
  return rows
    .filter((r) => r.answers !== null)
    .map((r) => ({
      round: r.round,
      questions: z.array(mcqQuestionSchema).parse(r.questions),
      answers: z.array(mcqAnswerSchema).parse(r.answers),
    }));
}

async function runQuestionRound(session: SessionRow, roundNumber: 1 | 2): Promise<void> {
  const priorRounds = await loadAnsweredRounds(session.id);
  const questions = await runAgent(
    llm,
    analystQuestionAgent,
    { idea: session.idea, roundNumber, priorRounds },
    costContext(session),
  );

  // Round 2 with nothing worth asking → straight to the Requirements
  // Document; leftover uncertainty becomes explicit assumptions (01 §3.3).
  if (questions.length === 0) {
    if (roundNumber === 1) {
      throw new Error("Analyst returned zero round-1 questions — retry");
    }
    await runRequirementsDoc(session);
    return;
  }

  await db.transaction(async (tx) => {
    // Re-answering round 1 regenerates round 2 — replace, don't duplicate.
    await tx
      .delete(schema.mcqRounds)
      .where(
        and(eq(schema.mcqRounds.sessionId, session.id), eq(schema.mcqRounds.round, roundNumber)),
      );
    const inserted = await tx
      .insert(schema.mcqRounds)
      .values({
        organizationId: session.organizationId,
        sessionId: session.id,
        round: roundNumber,
        questions,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error("mcq_rounds insert returned no row");
    await publishPlanningEvent(tx, session, { type: "question_round", round: toMcqRound(row) });
  });
}

async function runRequirementsDoc(session: SessionRow): Promise<void> {
  const rounds = await loadAnsweredRounds(session.id);
  const doc = await runAgent(
    llm,
    analystRequirementsAgent,
    { idea: session.idea, rounds },
    costContext(session),
  );

  await db.transaction(async (tx) => {
    const latest = await tx
      .select({ version: schema.requirementsDocs.version })
      .from(schema.requirementsDocs)
      .where(eq(schema.requirementsDocs.sessionId, session.id))
      .orderBy(desc(schema.requirementsDocs.version))
      .limit(1);
    const version = (latest[0]?.version ?? 0) + 1;
    const inserted = await tx
      .insert(schema.requirementsDocs)
      .values({
        organizationId: session.organizationId,
        sessionId: session.id,
        version,
        doc,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error("requirements_docs insert returned no row");

    // The doc itself is the analyst's decision output — one log row, with
    // the assumptions (the actual judgment calls) as its rationale (ADR-08).
    const decision = await tx
      .insert(schema.decisionLog)
      .values({
        organizationId: session.organizationId,
        sessionId: session.id,
        phase: "requirements",
        actor: "analyst",
        decision: `Requirements Document v${version} finalized`,
        rationale: doc.summary,
        alternativesConsidered:
          doc.assumptions.length > 0 ? `Assumptions made: ${doc.assumptions.join(" | ")}` : null,
      })
      .returning();
    const decisionRow = decision[0];
    if (!decisionRow) throw new Error("decision_log insert returned no row");

    await publishPlanningEvent(tx, session, {
      type: "requirements",
      doc: toRequirementsVersion(row),
    });
    await publishPlanningEvent(tx, session, {
      type: "decision",
      entry: toDecisionEntry(decisionRow),
    });
  });
}

// ---------------------------------------------------------------------------
// Planner
// ---------------------------------------------------------------------------

async function loadRequirements(sessionId: string): Promise<RequirementsDoc> {
  const rows = await db
    .select()
    .from(schema.requirementsDocs)
    .where(eq(schema.requirementsDocs.sessionId, sessionId))
    .orderBy(desc(schema.requirementsDocs.version))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("No requirements document — cannot plan architecture");
  return toRequirementsVersion(row).doc;
}

async function loadGraph(sessionId: string) {
  const [nodeRows, edgeRows] = await Promise.all([
    db
      .select()
      .from(schema.graphNodes)
      .where(eq(schema.graphNodes.sessionId, sessionId))
      .orderBy(asc(schema.graphNodes.createdAt)),
    db
      .select()
      .from(schema.graphEdges)
      .where(eq(schema.graphEdges.sessionId, sessionId))
      .orderBy(asc(schema.graphEdges.createdAt)),
  ]);
  return { nodes: nodeRows.map(toGraphNode), edges: edgeRows.map(toGraphEdge) };
}

/**
 * Commits one planner decision atomically: log row + node/edge upserts +
 * SSE events in a single transaction, so the diagram pane and the log pane
 * literally cannot drift (02 §2.3 — "they're reading the same commit").
 */
async function applyDecision(
  session: SessionRow,
  planned: PlannedDecision,
  actor: "planner",
): Promise<void> {
  await db.transaction(async (tx) => {
    const decisionRows = await tx
      .insert(schema.decisionLog)
      .values({
        organizationId: session.organizationId,
        sessionId: session.id,
        phase: "architecture",
        actor,
        decision: planned.decision,
        rationale: planned.rationale,
        alternativesConsidered: planned.alternativesConsidered ?? null,
      })
      .returning();
    const decisionRow = decisionRows[0];
    if (!decisionRow) throw new Error("decision_log insert returned no row");
    await publishPlanningEvent(tx, session, {
      type: "decision",
      entry: toDecisionEntry(decisionRow),
    });

    for (const spec of planned.nodes) {
      const upserted = await tx
        .insert(schema.graphNodes)
        .values({
          organizationId: session.organizationId,
          sessionId: session.id,
          nodeKey: spec.nodeKey,
          kind: spec.kind,
          label: spec.label,
          description: spec.description,
          acceptanceCriteria: spec.acceptanceCriteria ?? null,
          dependsOn: spec.dependsOn,
          decisionId: decisionRow.id,
        })
        .onConflictDoUpdate({
          target: [schema.graphNodes.sessionId, schema.graphNodes.nodeKey],
          set: {
            kind: spec.kind,
            label: spec.label,
            description: spec.description,
            acceptanceCriteria: spec.acceptanceCriteria ?? null,
            dependsOn: spec.dependsOn,
            decisionId: decisionRow.id,
            status: "active",
            // Re-emitting an existing key is a revision (01 §4.1).
            revision: sql`${schema.graphNodes.revision} + 1`,
          },
        })
        .returning();
      const nodeRow = upserted[0];
      if (!nodeRow) throw new Error("graph_nodes upsert returned no row");
      await publishPlanningEvent(tx, session, { type: "node", node: toGraphNode(nodeRow) });
    }

    for (const spec of planned.edges) {
      const upserted = await tx
        .insert(schema.graphEdges)
        .values({
          organizationId: session.organizationId,
          sessionId: session.id,
          sourceKey: spec.sourceKey,
          targetKey: spec.targetKey,
          label: spec.label ?? null,
        })
        .onConflictDoUpdate({
          target: [
            schema.graphEdges.sessionId,
            schema.graphEdges.sourceKey,
            schema.graphEdges.targetKey,
          ],
          set: { label: spec.label ?? null, status: "active" },
        })
        .returning();
      const edgeRow = upserted[0];
      if (!edgeRow) throw new Error("graph_edges upsert returned no row");
      await publishPlanningEvent(tx, session, { type: "edge", edge: toGraphEdge(edgeRow) });
    }

    if (planned.removeNodeKeys.length > 0) {
      for (const nodeKey of planned.removeNodeKeys) {
        const removed = await tx
          .update(schema.graphNodes)
          .set({ status: "removed", decisionId: decisionRow.id })
          .where(
            and(
              eq(schema.graphNodes.sessionId, session.id),
              eq(schema.graphNodes.nodeKey, nodeKey),
            ),
          )
          .returning();
        const nodeRow = removed[0];
        if (nodeRow) {
          await publishPlanningEvent(tx, session, { type: "node", node: toGraphNode(nodeRow) });
        }
      }
    }

    for (const spec of planned.removeEdges) {
      const removed = await tx
        .update(schema.graphEdges)
        .set({ status: "removed" })
        .where(
          and(
            eq(schema.graphEdges.sessionId, session.id),
            eq(schema.graphEdges.sourceKey, spec.sourceKey),
            eq(schema.graphEdges.targetKey, spec.targetKey),
          ),
        )
        .returning();
      const edgeRow = removed[0];
      if (edgeRow) {
        await publishPlanningEvent(tx, session, { type: "edge", edge: toGraphEdge(edgeRow) });
      }
    }

    await bumpGraphVersion(tx, session.id);
  });
}

async function runInitialPlan(session: SessionRow): Promise<void> {
  const requirements = await loadRequirements(session.id);

  // A re-run after a partial failure starts from a clean graph — node/edge
  // rows are mutable working state (unlike the append-only decision log),
  // and re-streamed upserts would otherwise inflate revisions and leave
  // orphans from the failed attempt. Live clients converge because node
  // events are keyed upserts; the snapshot rebuilds exactly.
  await db.delete(schema.graphEdges).where(eq(schema.graphEdges.sessionId, session.id));
  await db.delete(schema.graphNodes).where(eq(schema.graphNodes.sessionId, session.id));

  await withBackoff(async () => {
    const accumulator = new JsonlAccumulator(plannedDecisionSchema);
    let appliedCount = 0;
    // Decisions must commit in emission order — chain, don't parallelize.
    let chain = Promise.resolve();
    const enqueue = (planned: PlannedDecision): void => {
      chain = chain.then(async () => {
        await applyDecision(session, planned, "planner");
        appliedCount += 1;
      });
    };

    try {
      await llm.completeChatStream({
        role: "planner",
        messages: buildInitialPlanMessages({ idea: session.idea, requirements }),
        maxTokens: 16_000,
        temperature: 0.3,
        costContext: costContext(session),
        onDelta: (delta) => {
          for (const planned of accumulator.push(delta)) enqueue(planned);
        },
      });
      for (const planned of accumulator.flush()) enqueue(planned);
      await chain;
    } catch (error) {
      await chain.catch(() => undefined);
      // Once decisions have committed, an in-loop retry would re-append
      // them (duplicate log rows, revision inflation) — park for the
      // manual retry instead, which re-enters through the wipe above.
      if (appliedCount > 0) {
        throw new Error(
          `Planning failed after ${appliedCount} decisions were applied — use "try again" to re-plan (${error instanceof Error ? error.message : String(error)})`,
        );
      }
      throw error;
    }
    if (appliedCount === 0) {
      throw new Error("Planner produced no decisions — retry");
    }
  });

  await runConsistencyCheck(session);
}

async function runEditPrompt(session: SessionRow, prompt: string): Promise<void> {
  const requirements = await loadRequirements(session.id);
  const { nodes, edges } = await loadGraph(session.id);
  const recentDecisions = (
    await db
      .select()
      .from(schema.decisionLog)
      .where(eq(schema.decisionLog.sessionId, session.id))
      .orderBy(asc(schema.decisionLog.createdAt))
  ).map((d) => ({ actor: d.actor, decision: d.decision }));

  // The user's prompt is itself a decision-log row, source: user (01 §4.2).
  await db.transaction(async (tx) => {
    const rows = await tx
      .insert(schema.decisionLog)
      .values({
        organizationId: session.organizationId,
        sessionId: session.id,
        phase: "architecture",
        actor: "user",
        decision: prompt,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("decision_log insert returned no row");
    await publishPlanningEvent(tx, session, { type: "decision", entry: toDecisionEntry(row) });
  });

  let graphChanged = false;
  await withBackoff(async () => {
    const accumulator = new JsonlAccumulator(plannerEditLineSchema);
    let chain = Promise.resolve();
    let sawClarification = false;
    let lineCount = 0;
    let appliedCount = 0;

    const handleLine = (line: z.infer<typeof plannerEditLineSchema>): void => {
      lineCount += 1;
      if (sawClarification) return; // A clarification ends the edit turn.
      if (line.type === "clarification") {
        sawClarification = true;
        chain = chain.then(() => publishClarification(session, line.statement, line.question));
        return;
      }
      graphChanged = true;
      chain = chain.then(async () => {
        await applyDecision(session, line, "planner");
        appliedCount += 1;
      });
    };

    try {
      await llm.completeChatStream({
        role: "planner",
        messages: buildEditMessages({
          requirements,
          nodes,
          edges,
          recentDecisions,
          userPrompt: prompt,
        }),
        maxTokens: 8_000,
        temperature: 0.3,
        costContext: costContext(session),
        onDelta: (delta) => {
          for (const line of accumulator.push(delta)) handleLine(line);
        },
      });
      for (const line of accumulator.flush()) handleLine(line);
      await chain;
    } catch (error) {
      await chain.catch(() => undefined);
      // Partially-applied edit: retrying the whole stream would duplicate
      // the already-committed decisions. Park it, but repoint the stored
      // task at a consistency check — "try again" then re-validates the
      // applied prefix instead of re-streaming the edit; the user
      // re-prompts for whatever is still missing.
      if (appliedCount > 0) {
        const task: AgentTask = { kind: "consistency_check" };
        await db
          .update(schema.planningSessions)
          .set({ agentTask: task })
          .where(eq(schema.planningSessions.id, session.id));
        throw new Error(
          `The edit was partially applied (${appliedCount} decisions) before failing — review the graph and re-prompt for what's missing (${error instanceof Error ? error.message : String(error)})`,
        );
      }
      throw error;
    }
    if (lineCount === 0) {
      throw new Error("Planner returned nothing for the edit prompt — retry");
    }
  });

  // A stale verdict never unlocks confirm; only re-check when the graph
  // actually moved (a clarification-only turn leaves it untouched).
  if (graphChanged) {
    await runConsistencyCheck(session);
  }
}

async function publishClarification(
  session: SessionRow,
  statement: string,
  question: { text: string; type: "single_select" | "multi_select"; options: string[]; affects: string[] },
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .insert(schema.decisionLog)
      .values({
        organizationId: session.organizationId,
        sessionId: session.id,
        phase: "architecture",
        actor: "planner",
        decision: `Clarification needed: ${statement}`,
        rationale: "The requested change conflicts with confirmed requirements or is infeasible as stated — answering the question below resolves it.",
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("decision_log insert returned no row");
    await publishPlanningEvent(tx, session, { type: "decision", entry: toDecisionEntry(row) });
    await publishPlanningEvent(tx, session, {
      type: "clarification",
      statement,
      question: { ...question, id: crypto.randomUUID() },
    });
  });
}

// ---------------------------------------------------------------------------
// Consistency gate (01 §4.3)
// ---------------------------------------------------------------------------

async function runConsistencyCheck(session: SessionRow): Promise<void> {
  const requirements = await loadRequirements(session.id);
  const { nodes, edges } = await loadGraph(session.id);
  // The version being judged — reads before the checks so a concurrent
  // mutation can only make the verdict stale, never falsely fresh.
  const current = await db
    .select({ graphVersion: schema.planningSessions.graphVersion })
    .from(schema.planningSessions)
    .where(eq(schema.planningSessions.id, session.id))
    .limit(1);
  const graphVersion = current[0]?.graphVersion ?? 0;

  const structuralIssues = checkGraphStructure(nodes, edges);
  const reviewIssues = await runAgent(
    llm,
    consistencyReviewAgent,
    { requirements, nodes, edges },
    costContext(session),
  );

  const result: ConsistencyResult = {
    status: structuralIssues.length + reviewIssues.length === 0 ? "pass" : "fail",
    issues: [...structuralIssues, ...reviewIssues],
    graphVersion,
  };

  await db.transaction(async (tx: Tx) => {
    await tx
      .update(schema.planningSessions)
      .set({ consistency: result })
      .where(eq(schema.planningSessions.id, session.id));
    await publishPlanningEvent(tx, session, { type: "consistency", result });
  });
}
