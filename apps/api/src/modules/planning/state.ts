import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db, type Tx } from "@mullion/db";
import {
  agentTaskSchema,
  mcqAnswerSchema,
  mcqQuestionSchema,
  type AgentTask,
  type DecisionEntry,
  type GraphEdge,
  type GraphNode,
  type McqRound,
  type PlanningEvent,
  type RequirementsDocVersion,
  requirementsDocSchema,
} from "@mullion/schemas";
import { publishStreamEvent } from "../../lib/sse.js";

export type SessionRow = typeof schema.planningSessions.$inferSelect;
export type NodeRow = typeof schema.graphNodes.$inferSelect;
export type EdgeRow = typeof schema.graphEdges.$inferSelect;
export type DecisionRow = typeof schema.decisionLog.$inferSelect;
export type McqRoundRow = typeof schema.mcqRounds.$inferSelect;
export type RequirementsRow = typeof schema.requirementsDocs.$inferSelect;

// ---------------------------------------------------------------------------
// Row → API-shape mappers. jsonb columns re-validate on read: the DB stores
// what zod let through at write time, but parse-don't-trust applies at every
// boundary, and a bad row failing loudly here beats propagating downstream.
// ---------------------------------------------------------------------------

const dependsOnSchema = z.array(z.string());

export function toGraphNode(row: NodeRow): GraphNode {
  return {
    id: row.id,
    nodeKey: row.nodeKey,
    kind: row.kind,
    label: row.label,
    description: row.description,
    status: row.status,
    revision: row.revision,
    ...(row.acceptanceCriteria ? { acceptanceCriteria: row.acceptanceCriteria } : {}),
    dependsOn: dependsOnSchema.parse(row.dependsOn),
    decisionId: row.decisionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toGraphEdge(row: EdgeRow): GraphEdge {
  return {
    id: row.id,
    sourceKey: row.sourceKey,
    targetKey: row.targetKey,
    ...(row.label ? { label: row.label } : {}),
    status: row.status,
  };
}

export function toDecisionEntry(row: DecisionRow): DecisionEntry {
  return {
    id: row.id,
    phase: row.phase,
    actor: row.actor,
    decision: row.decision,
    rationale: row.rationale,
    alternativesConsidered: row.alternativesConsidered,
    supersedes: row.supersedes,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toMcqRound(row: McqRoundRow): McqRound {
  return {
    id: row.id,
    sessionId: row.sessionId,
    round: row.round,
    questions: z.array(mcqQuestionSchema).parse(row.questions),
    answers: row.answers === null ? null : z.array(mcqAnswerSchema).parse(row.answers),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toRequirementsVersion(row: RequirementsRow): RequirementsDocVersion {
  return {
    id: row.id,
    sessionId: row.sessionId,
    version: row.version,
    doc: requirementsDocSchema.parse(row.doc),
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Event publishing — thin typed wrapper so every payload passing through is
// a PlanningEvent by construction.
// ---------------------------------------------------------------------------

export async function publishPlanningEvent(
  db: Db | Tx,
  session: Pick<SessionRow, "id" | "organizationId">,
  event: PlanningEvent,
): Promise<void> {
  await publishStreamEvent(db, {
    streamId: session.id,
    organizationId: session.organizationId,
    eventType: event.type,
    payload: event,
  });
}

// ---------------------------------------------------------------------------
// Agent-loop claim/finish/fail (02 §2.4). The claim is a conditional UPDATE
// — a session already 'working' refuses a second concurrent run, and that
// holds across API instances because the state lives in the row.
// ---------------------------------------------------------------------------

export async function claimAgent(
  db: Db,
  session: Pick<SessionRow, "id" | "organizationId">,
  task: AgentTask,
  actor: string,
): Promise<boolean> {
  const claimed = await db
    .update(schema.planningSessions)
    .set({ agentState: "working", agentTask: task, agentError: null })
    .where(
      and(
        eq(schema.planningSessions.id, session.id),
        ne(schema.planningSessions.agentState, "working"),
        eq(schema.planningSessions.status, "active"),
      ),
    )
    .returning({ id: schema.planningSessions.id });
  if (!claimed[0]) return false;
  await publishPlanningEvent(db, session, { type: "agent_status", state: "working", actor });
  return true;
}

export async function finishAgent(
  db: Db,
  session: Pick<SessionRow, "id" | "organizationId">,
  actor: string,
): Promise<void> {
  await db
    .update(schema.planningSessions)
    .set({ agentState: "idle", agentTask: null, agentError: null })
    .where(eq(schema.planningSessions.id, session.id));
  await publishPlanningEvent(db, session, { type: "agent_status", state: "idle", actor });
}

/**
 * Terminal failure after backoff retries: keep the task on the row so the
 * manual "try again" (ADR-30) re-runs exactly what failed.
 */
export async function failAgent(
  db: Db,
  session: Pick<SessionRow, "id" | "organizationId">,
  actor: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db
    .update(schema.planningSessions)
    .set({ agentState: "error", agentError: message })
    .where(eq(schema.planningSessions.id, session.id));
  await publishPlanningEvent(db, session, {
    type: "agent_status",
    state: "error",
    actor,
    message,
  });
}

export function parseAgentTask(raw: unknown): AgentTask | null {
  const parsed = agentTaskSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Bumps the graph version inside the mutation's own transaction. */
export async function bumpGraphVersion(tx: Tx, sessionId: string): Promise<number> {
  const rows = await tx
    .update(schema.planningSessions)
    .set({ graphVersion: sql`${schema.planningSessions.graphVersion} + 1` })
    .where(eq(schema.planningSessions.id, sessionId))
    .returning({ graphVersion: schema.planningSessions.graphVersion });
  const row = rows[0];
  if (!row) throw new Error(`Session ${sessionId} vanished mid-transaction`);
  return row.graphVersion;
}
