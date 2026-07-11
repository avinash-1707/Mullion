import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { ApplicationFailure } from "@temporalio/common";
import { Worker } from "@temporalio/worker";
import type { Db } from "@mullion/db";
import { LocalDockerDriver, resolveDocker } from "@mullion/sandbox";
import type { TaskResult } from "@mullion/schemas";
import { ScriptedLlm, toolCall } from "@mullion/agents/testing";
import { buildRunWorkflow } from "./workflows.js";
import { createActivities } from "./activities.js";
import { WORKFLOWS_PATH } from "./worker.js";
import { BUILD_TASK_QUEUE, type TaskGraphNode } from "./policy.js";
import type { BuildActivities, BuildRunInput } from "./types.js";

/**
 * Workflow-logic + crash-resume tests. These need a real (downloaded)
 * Temporal test server, so they live in the integration tier (gated by
 * TEMPORAL_INTEGRATION=1), not the binary-free unit run. Activities are
 * mocked — the crash-resume proof is about workflow durability, not the
 * real Docker/LLM pipeline (that is the full-pipeline test).
 */

const RUN = (over?: Partial<BuildRunInput>): BuildRunInput => ({
  runId: "run-1",
  buildSpecId: "spec-1",
  organizationId: "org-1",
  userId: "user-1",
  ...over,
});

const verified: TaskResult = { status: "verified", turns: 1, costUsd: 0, durationMs: 1 };
const failed = (reason: TaskResult extends { reason: infer R } ? R : never): TaskResult =>
  ({ status: "failed", reason, turns: 1, costUsd: 0, durationMs: 1 }) as TaskResult;

/** Build a mock activities object over a graph + a per-task result script. */
function mockActivities(args: {
  graph: TaskGraphNode[];
  run: (specTaskId: string, attempt: number) => TaskResult | Promise<TaskResult>;
  statuses?: string[];
  runCounts?: Map<string, number>;
  escalations?: Array<{ specTaskId: string; reason: string }>;
  loadThrows?: boolean;
}): BuildActivities {
  return {
    async loadTaskGraphActivity() {
      if (args.loadThrows) {
        // Non-retryable = the real deterministic-failure path (spec parse),
        // so the workflow's catch fires fast instead of retrying 20×.
        throw ApplicationFailure.nonRetryable("simulated spec-parse failure", "SpecMalformed");
      }
      return args.graph;
    },
    async ensureTaskRowActivity({ node }) {
      return { taskRowId: `row-${node.task_id}` };
    },
    async setRunStatusActivity({ status }) {
      args.statuses?.push(status);
    },
    async runTaskActivity({ specTaskId, attempt }) {
      args.runCounts?.set(specTaskId, (args.runCounts.get(specTaskId) ?? 0) + 1);
      return args.run(specTaskId, attempt);
    },
    async publishEscalationActivity({ specTaskId, reason }) {
      args.escalations?.push({ specTaskId, reason });
    },
  };
}

const node = (id: string, deps: string[] = []): TaskGraphNode => ({
  task_id: id,
  description: id,
  acceptance_criteria: "ok",
  depends_on: deps,
});

// Code-level gate: this file boots a real Temporal server, so it only runs
// under TEMPORAL_INTEGRATION=1 (not merely the script name). A plain
// `vitest run` on the file skips instead of downloading/booting a server.
const temporalOn = process.env["TEMPORAL_INTEGRATION"] === "1";

let env: TestWorkflowEnvironment;

beforeAll(async () => {
  if (!temporalOn) return;
  // Real local dev server (not time-skipping): time-skipping fast-forwards
  // timers but cannot model a worker handoff, which the crash-resume test
  // requires. Real-time is fine here — the mock activities are instant and
  // the workflow uses no sleeps.
  env = await TestWorkflowEnvironment.createLocal();
}, 120_000);

afterAll(async () => {
  await env?.teardown();
});

async function runWorkflow(activities: BuildActivities, input: BuildRunInput, taskQueue: string) {
  const worker = await Worker.create({
    connection: env.nativeConnection,
    taskQueue,
    workflowsPath: WORKFLOWS_PATH,
    activities,
  });
  return worker.runUntil(
    env.client.workflow.execute(buildRunWorkflow, {
      workflowId: `wf-${taskQueue}`,
      taskQueue,
      args: [input],
    }),
  );
}

describe.skipIf(!temporalOn)("buildRunWorkflow logic", () => {
  it("runs a dependency chain in order and marks the run done", async () => {
    const statuses: string[] = [];
    const seen: string[] = [];
    const acts = mockActivities({
      graph: [node("c", ["b"]), node("b", ["a"]), node("a")],
      statuses,
      run: (id) => {
        seen.push(id);
        return verified;
      },
    });
    const result = await runWorkflow(acts, RUN(), "q-order");
    expect(result.status).toBe("done");
    expect(result.tasksVerified).toBe(3);
    expect(seen).toEqual(["a", "b", "c"]);
    expect(statuses).toEqual(["building", "done"]);
  }, 60_000);

  it("consumes the retry budget then fails the run, emitting one escalation", async () => {
    const counts = new Map<string, number>();
    const escalations: Array<{ specTaskId: string; reason: string }> = [];
    const acts = mockActivities({
      graph: [node("a")],
      runCounts: counts,
      escalations,
      run: () => failed("test_failed" as never),
    });
    const result = await runWorkflow(acts, RUN(), "q-budget");
    expect(result.status).toBe("failed");
    expect(result.failedReason).toBe("test_failed");
    // RETRY_BUDGET = 3 attempts.
    expect(counts.get("a")).toBe(3);
    // Exactly one escalation_required emitted at exhaustion (ADR-51).
    expect(escalations).toEqual([{ specTaskId: "a", reason: "test_failed" }]);
  }, 60_000);

  it("recovers when a task fails twice then verifies on the last attempt", async () => {
    const counts = new Map<string, number>();
    const escalations: Array<{ specTaskId: string; reason: string }> = [];
    const acts = mockActivities({
      graph: [node("a")],
      runCounts: counts,
      escalations,
      run: (_id, attempt) => (attempt < 3 ? failed("test_failed" as never) : verified),
    });
    const result = await runWorkflow(acts, RUN(), "q-recover");
    expect(result.status).toBe("done");
    expect(result.tasksVerified).toBe(1);
    expect(counts.get("a")).toBe(3);
    expect(escalations).toEqual([]); // recovered before exhaustion → no escalation
  }, 60_000);

  it("stops dispatching later tasks when an early task fails", async () => {
    const counts = new Map<string, number>();
    const acts = mockActivities({
      graph: [node("a"), node("b", ["a"])],
      runCounts: counts,
      run: (id) => (id === "a" ? failed("test_failed" as never) : verified),
    });
    const result = await runWorkflow(acts, RUN(), "q-earlyfail");
    expect(result.status).toBe("failed");
    expect(result.failedTaskId).toBe("a");
    expect(counts.get("b")).toBeUndefined(); // b never dispatched
  }, 60_000);

  it("marks the run failed (not stuck 'building') when an activity exhausts its retries", async () => {
    // The Critical fix: an uncaught activity failure must terminate the run,
    // not wedge it in 'building' holding the ADR-29 slot with no reaper.
    const statuses: string[] = [];
    const acts = mockActivities({
      graph: [node("a")],
      statuses,
      loadThrows: true, // loadTaskGraphActivity throws on every attempt
      run: () => verified,
    });
    const result = await runWorkflow(acts, RUN(), "q-infra-fault");
    expect(result.status).toBe("failed");
    // building was set, then the catch drove it terminal.
    expect(statuses).toContain("building");
    expect(statuses.at(-1)).toBe("failed");
  }, 90_000);

  it("short-circuits immediately on budget_exceeded (no retries)", async () => {
    const counts = new Map<string, number>();
    const acts = mockActivities({
      graph: [node("a")],
      runCounts: counts,
      run: () => failed("budget_exceeded" as never),
    });
    const result = await runWorkflow(acts, RUN(), "q-be");
    expect(result.status).toBe("failed");
    expect(counts.get("a")).toBe(1); // terminal, no second attempt
  }, 60_000);

  it("fails the run when the task_graph has a cycle", async () => {
    const statuses: string[] = [];
    const acts = mockActivities({
      graph: [node("a", ["b"]), node("b", ["a"])],
      statuses,
      run: () => verified,
    });
    const result = await runWorkflow(acts, RUN(), "q-cycle");
    expect(result.status).toBe("failed");
    expect(result.failedReason).toMatch(/cycle/);
    expect(statuses).toEqual(["building", "failed"]);
  }, 60_000);
});

describe.skipIf(!temporalOn)("durable crash-resume (the M3 DoD)", () => {
  it("does NOT re-run a completed task after the worker is replaced", async () => {
    // Shared across both workers — proves task A's activity fires exactly once
    // even though a second worker takes over.
    const runCounts = new Map<string, number>();
    const taskQueue = "q-crash";
    const input = RUN({ runId: "run-crash" });

    let resolveADone: () => void;
    const aDone = new Promise<void>((r) => {
      resolveADone = r;
    });

    const acts = mockActivities({
      graph: [node("a"), node("b", ["a"])],
      runCounts,
      run: (id) => {
        if (id === "a") resolveADone();
        return verified;
      },
    });

    // Worker 1 runs until task A has completed, then stops polling (its
    // graceful shutdown = a worker going away mid-run). A's result is now in
    // Temporal history.
    const worker1 = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath: WORKFLOWS_PATH,
      activities: acts,
    });
    const handle = await env.client.workflow.start(buildRunWorkflow, {
      workflowId: "wf-crash",
      taskQueue,
      args: [input],
    });
    await worker1.runUntil(aDone);

    // Worker 2 takes over the same task queue + server. It replays history,
    // sees A's result, and must NOT invoke runTaskActivity for A again.
    const worker2 = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath: WORKFLOWS_PATH,
      activities: acts,
    });
    const result = await worker2.runUntil(handle.result());

    expect(result.status).toBe("done");
    expect(runCounts.get("a")).toBe(1); // completed task NOT re-run across the restart
    expect(runCounts.get("b")).toBeGreaterThanOrEqual(1);
  }, 120_000);
});

// Proves the REAL activity stack composes through the workflow: a real
// LocalDockerSandbox + scripted Coder + real buildTask, driven by the
// orchestrator end to end. Skips without Docker.
async function dockerUp(): Promise<boolean> {
  try {
    await resolveDocker();
    return true;
  } catch {
    return false;
  }
}
const dockerAvailable = await dockerUp();

/** Fake db: serves runTaskActivity's task-row read, no-ops buildTask's writes. */
function pipelineDb(): Db {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              { description: "write sum.js", acceptanceCriteria: "node --test", verifyCommand: "node --test sum.test.js" },
            ]),
        }),
      }),
    }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => Promise.resolve() }) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  } as unknown as Db;
}

describe.skipIf(!temporalOn || !dockerAvailable)("full pipeline through the workflow (integration)", () => {
  it("runs a real Docker-backed task via the orchestrator to done", async () => {
    const graph: TaskGraphNode[] = [
      { task_id: "sum", description: "write sum.js", acceptance_criteria: "node --test", depends_on: [] },
    ];
    // Scripted Coder writes a correct sum.js; the inline verifier (default,
    // no makeVerify) runs `node --test sum.test.js` — but there's no test
    // file, so use a verify the Coder satisfies: write sum.js AND a passing
    // check, then submit runs the verifyCommand from the task row.
    const llm = new ScriptedLlm([
      { toolCalls: [toolCall("c1", "writeFile", { path: "sum.js", content: "exports.sum=(a,b)=>a+b;" })] },
      {
        toolCalls: [
          toolCall("c2", "writeFile", {
            path: "sum.test.js",
            content: [
              "const {test}=require('node:test');const a=require('node:assert');",
              "const {sum}=require('./sum.js');",
              "test('adds',()=>a.strictEqual(sum(2,3),5));",
            ].join(""),
          }),
        ],
      },
      { toolCalls: [toolCall("c3", "submit", {})] },
    ]);

    const activities: BuildActivities = {
      ...createActivities({
        db: pipelineDb(),
        llm,
        driver: new LocalDockerDriver(),
        sandboxCostPerSec: 0.000042,
      }),
      // Stub the graph load + row upsert + status writes (fake db); keep the
      // REAL runTaskActivity (real Docker + buildTask).
      async loadTaskGraphActivity() {
        return graph;
      },
      async ensureTaskRowActivity({ node }) {
        return { taskRowId: `row-${node.task_id}` };
      },
      async setRunStatusActivity() {
        /* no-op */
      },
    };

    const result = await runWorkflow(activities, RUN({ runId: "run-pipe" }), "q-pipeline");
    expect(result.status).toBe("done");
    expect(result.tasksVerified).toBe(1);
  }, 180_000);
});
