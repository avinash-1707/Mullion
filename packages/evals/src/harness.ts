import { randomUUID } from "node:crypto";
import { and, eq, notInArray } from "drizzle-orm";
import { schema, type Db } from "@mullion/db";
import {
  DEFAULT_TASK_CAPS,
  buildTask,
  makeTesterVerifier,
  type OneShotLlm,
  type ToolCallingLlm,
} from "@mullion/agents";
import { RETRY_BUDGET, dispositionFor, topoSort } from "@mullion/orchestrator";
import type { SandboxDriver } from "@mullion/sandbox";
import type { BuildSpecArtifact } from "@mullion/schemas";
import type { EvalNodeFixture, EvalTaskFixture } from "./tasks.js";
import type { EvalTaskOutcome, NodeOutcome } from "./metrics.js";

/**
 * Direct-drive eval harness (ADR-60): runs each fixed task's frozen graph
 * through the REAL buildTask loop + REAL sandbox + REAL retry policy
 * (RETRY_BUDGET / dispositionFor), persisting runs/tasks/messages/costs
 * through the same tables production uses. Temporal is deliberately not in
 * the loop here — its orchestration is covered by the integration suite,
 * and evals measure task-level build quality per version.
 */

export const EVAL_USER_ID = "eval-user";
export const EVAL_ORG_ID = "eval-org";

export interface HarnessDeps {
  db: Db;
  driver: SandboxDriver;
  image: string;
  sandboxCostPerSec: number;
  budget: { runBudgetUsd: number; orgBudgetUsd: number };
  /** Coder LLM for one node attempt — scripted fixtures or the real client. */
  coderLlmFor: (node: EvalNodeFixture, attempt: number) => ToolCallingLlm;
  testerLlm: OneShotLlm;
}

/** Idempotent eval principal — the org every eval run's cost attributes to. */
export async function ensureEvalPrincipal(db: Db): Promise<void> {
  await db
    .insert(schema.user)
    .values({ id: EVAL_USER_ID, name: "Eval Harness", email: "evals@mullion.local" })
    .onConflictDoNothing();
  await db
    .insert(schema.organization)
    .values({ id: EVAL_ORG_ID, name: "Eval Harness", slug: "eval-harness" })
    .onConflictDoNothing();
  await db
    .insert(schema.member)
    .values({ id: "eval-member", userId: EVAL_USER_ID, organizationId: EVAL_ORG_ID, role: "owner" })
    .onConflictDoNothing();
}

/**
 * A previous eval crash leaves a non-terminal run that ADR-29's
 * one-active-per-user index would wedge on — fail it before starting.
 * Scoped to the eval user only, mirroring the build-task CLI's cleanup.
 */
export async function failStuckEvalRuns(db: Db): Promise<void> {
  const stuck = await db
    .select({ id: schema.runs.id })
    .from(schema.runs)
    .where(
      and(eq(schema.runs.userId, EVAL_USER_ID), notInArray(schema.runs.status, ["done", "failed"])),
    );
  for (const run of stuck) {
    await db.update(schema.runs).set({ status: "failed" }).where(eq(schema.runs.id, run.id));
    await db
      .update(schema.tasks)
      .set({
        status: "failed",
        result: { status: "failed", reason: "crashed", turns: 0, costUsd: 0, durationMs: 0 },
      })
      .where(
        and(eq(schema.tasks.runId, run.id), notInArray(schema.tasks.status, ["verified", "failed"])),
      );
  }
}

function artifactFor(fixture: EvalTaskFixture): BuildSpecArtifact {
  return {
    build_spec_id: randomUUID(),
    content_hash: `sha256:eval-${fixture.id}`,
    requirements: { idea: fixture.idea, eval_task: fixture.id },
    architecture_graph: { nodes: [], edges: [] },
    task_graph: fixture.nodes.map((n) => ({
      task_id: n.taskId,
      description: n.description,
      acceptance_criteria: n.acceptanceCriteria,
      depends_on: n.dependsOn,
    })),
    decision_log_ids: [],
    frozen_at: new Date().toISOString(),
  };
}

async function runNode(
  fixture: EvalTaskFixture,
  node: EvalNodeFixture,
  ids: { runId: string; taskRowId: string },
  deps: HarnessDeps,
): Promise<NodeOutcome> {
  const started = Date.now();
  let turns = 0;
  let costUsd = 0;

  for (let attempt = 1; attempt <= RETRY_BUDGET; attempt += 1) {
    const sandbox = await deps.driver.create({
      image: deps.image,
      timeoutMs: DEFAULT_TASK_CAPS.wallClockMs + 60_000,
      runId: ids.runId,
    });
    try {
      const result = await buildTask(
        {
          task: {
            taskId: node.taskId,
            description: node.description,
            acceptanceCriteria: node.acceptanceCriteria,
          },
          verifyCommand: node.verifyCommand,
          caps: DEFAULT_TASK_CAPS,
          costContext: { organizationId: EVAL_ORG_ID, userId: EVAL_USER_ID, runId: ids.runId },
          organizationId: EVAL_ORG_ID,
          runId: ids.runId,
          taskRowId: ids.taskRowId,
          userId: EVAL_USER_ID,
        },
        {
          sandbox,
          llm: deps.coderLlmFor(node, attempt),
          db: deps.db,
          sandboxCostPerSec: deps.sandboxCostPerSec,
          budget: deps.budget,
          verify: makeTesterVerifier({
            driver: deps.driver,
            llm: deps.testerLlm,
            runnerTests: node.runnerTests,
            testCommand: node.testCommand,
            image: deps.image,
            sandboxTimeoutMs: DEFAULT_TASK_CAPS.wallClockMs + 60_000,
            db: deps.db,
            sandboxCostPerSec: deps.sandboxCostPerSec,
          }),
        },
      );

      turns += result.turns;
      costUsd += result.costUsd;

      if (result.status === "verified") {
        return {
          taskId: node.taskId,
          status: "verified",
          attempts: attempt,
          turns,
          costUsd,
          durationMs: Date.now() - started,
          escalated: false,
        };
      }

      const terminal = dispositionFor(result.reason) === "terminal";
      if (terminal || attempt === RETRY_BUDGET) {
        return {
          taskId: node.taskId,
          status: "failed",
          attempts: attempt,
          turns,
          costUsd,
          durationMs: Date.now() - started,
          failureReason: result.reason,
          // Retry budget exhausted or terminal failure — the condition that
          // opens an escalation gate (ADR-55) in an orchestrated run.
          escalated: true,
        };
      }
    } finally {
      await sandbox.dispose();
    }
  }
  throw new Error("unreachable: retry loop must return");
}

export async function runEvalTask(
  fixture: EvalTaskFixture,
  deps: HarnessDeps,
): Promise<EvalTaskOutcome> {
  const started = Date.now();
  const artifact = artifactFor(fixture);

  const [session] = await deps.db
    .insert(schema.planningSessions)
    .values({
      organizationId: EVAL_ORG_ID,
      userId: EVAL_USER_ID,
      // 'confirmed', not 'active' — evals must never collide with ADR-29's
      // one-active-session-per-user index, and a frozen spec implies
      // confirmation anyway.
      status: "confirmed",
      phase: "architecture",
      idea: fixture.idea,
    })
    .returning();
  if (!session) throw new Error("eval session insert returned nothing");

  const [spec] = await deps.db
    .insert(schema.buildSpecs)
    .values({
      organizationId: EVAL_ORG_ID,
      sessionId: session.id,
      contentHash: artifact.content_hash,
      spec: artifact,
    })
    .returning();
  if (!spec) throw new Error("eval build spec insert returned nothing");

  const [run] = await deps.db
    .insert(schema.runs)
    .values({
      organizationId: EVAL_ORG_ID,
      userId: EVAL_USER_ID,
      buildSpecId: spec.id,
      status: "building",
    })
    .returning();
  if (!run) throw new Error("eval run insert returned nothing");

  const order = topoSort(
    fixture.nodes.map((n) => ({
      task_id: n.taskId,
      description: n.description,
      acceptance_criteria: n.acceptanceCriteria,
      depends_on: n.dependsOn,
    })),
  );
  const byId = new Map(fixture.nodes.map((n) => [n.taskId, n]));
  const outcomes: NodeOutcome[] = [];
  const verified = new Set<string>();

  try {
    for (const graphNode of order) {
      const node = byId.get(graphNode.task_id);
      if (!node) throw new Error(`fixture ${fixture.id}: node ${graphNode.task_id} missing`);

      if (!node.dependsOn.every((d) => verified.has(d))) {
        // Upstream failed — dependents never run, exactly like the workflow.
        outcomes.push({
          taskId: node.taskId,
          status: "failed",
          attempts: 0,
          turns: 0,
          costUsd: 0,
          durationMs: 0,
          failureReason: "crashed",
          escalated: false,
        });
        continue;
      }

      const [taskRow] = await deps.db
        .insert(schema.tasks)
        .values({
          organizationId: EVAL_ORG_ID,
          runId: run.id,
          specTaskId: node.taskId,
          description: node.description,
          acceptanceCriteria: node.acceptanceCriteria,
          dependsOn: node.dependsOn,
          verifyCommand: node.verifyCommand,
        })
        .returning();
      if (!taskRow) throw new Error("eval task insert returned nothing");

      const outcome = await runNode(fixture, node, { runId: run.id, taskRowId: taskRow.id }, deps);
      outcomes.push(outcome);
      if (outcome.status === "verified") verified.add(node.taskId);
    }
  } finally {
    const allVerified = outcomes.length === fixture.nodes.length && outcomes.every((o) => o.status === "verified");
    await deps.db
      .update(schema.runs)
      .set({ status: allVerified ? "done" : "failed" })
      .where(eq(schema.runs.id, run.id));
  }

  const status = outcomes.every((o) => o.status === "verified") ? "verified" : "failed";
  return {
    taskId: fixture.id,
    title: fixture.title,
    difficulty: fixture.difficulty,
    status,
    expected: fixture.expected,
    matchedExpectation: status === fixture.expected,
    nodes: outcomes,
    costUsd: outcomes.reduce((s, o) => s + o.costUsd, 0),
    durationMs: Date.now() - started,
  };
}
