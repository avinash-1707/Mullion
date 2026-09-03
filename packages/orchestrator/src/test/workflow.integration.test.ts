import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { ApplicationFailure } from "@temporalio/common";
import { Worker } from "@temporalio/worker";
import type { Db } from "@mullion/db";
import { LocalDockerDriver, resolveDocker } from "@mullion/sandbox";
import type { TaskResult } from "@mullion/schemas";
import { ScriptedLlm, toolCall } from "@mullion/agents/testing";
import { buildRunWorkflow, escalationSignal, type EscalationDecision } from "../workflows.js";
import { createActivities } from "../activities.js";
import { WORKFLOWS_PATH } from "../worker.js";
import { type TaskGraphNode } from "../policy.js";
import type { BuildActivities, BuildRunInput } from "../types.js";

/**
 * Workflow-logic, escalation, crash-resume, and full-pipeline tests. Need a
 * real (downloaded) Temporal test server → integration tier, gated by
 * TEMPORAL_INTEGRATION=1. Two envs: TIME-SKIPPING fast-forwards the 30-min
 * escalation timeout (for logic + the timeout-default test); LOCAL (real
 * time) is used where a worker handoff (crash-resume) or a fast human signal
 * (approve/redirect) must beat the timeout.
 */

const RUN = (over?: Partial<BuildRunInput>): BuildRunInput => ({
  runId: "run-1",
  buildSpecId: "spec-1",
  organizationId: "org-1",
  userId: "user-1",
  ...over,
});

const verified: TaskResult = { status: "verified", turns: 1, costUsd: 0, durationMs: 1, producedPaths: [] };
const failed = (reason: TaskResult extends { reason: infer R } ? R : never): TaskResult =>
  ({ status: "failed", reason, turns: 1, costUsd: 0, durationMs: 1, producedPaths: [] }) as TaskResult;

interface MockCapture {
  statuses: string[];
  runCounts: Map<string, number>;
  escalations: Array<{ specTaskId: string; reason: string }>;
  reviews: number;
  ships: Array<{ isPartial: boolean }>;
  redirects: Array<string | undefined>;
}
function capture(): MockCapture {
  return { statuses: [], runCounts: new Map(), escalations: [], reviews: 0, ships: [], redirects: [] };
}

function mockActivities(args: {
  graph: TaskGraphNode[];
  run: (specTaskId: string, attempt: number, redirect?: string) => TaskResult | Promise<TaskResult>;
  cap: MockCapture;
  loadThrows?: boolean;
  reviewApproved?: boolean;
}): BuildActivities {
  return {
    async loadTaskGraphActivity() {
      if (args.loadThrows) {
        throw ApplicationFailure.nonRetryable("simulated spec-parse failure", "SpecMalformed");
      }
      return args.graph;
    },
    async ensureTaskRowActivity({ node }) {
      return { taskRowId: `row-${node.task_id}` };
    },
    async setRunStatusActivity({ status }) {
      args.cap.statuses.push(status);
    },
    async runTaskActivity({ specTaskId, attempt, redirectInstruction }) {
      args.cap.runCounts.set(specTaskId, (args.cap.runCounts.get(specTaskId) ?? 0) + 1);
      args.cap.redirects.push(redirectInstruction);
      return args.run(specTaskId, attempt, redirectInstruction);
    },
    async publishEscalationActivity({ specTaskId, reason }) {
      args.cap.escalations.push({ specTaskId, reason });
    },
    async reviewActivity() {
      args.cap.reviews += 1;
      return { approved: args.reviewApproved ?? true, blockerCount: 0 };
    },
    async shipActivity({ isPartial }) {
      args.cap.ships.push({ isPartial });
      return { deliveries: [{ kind: "archive", ref: "fake://archive" }] };
    },
  };
}

const node = (id: string, deps: string[] = []): TaskGraphNode => ({
  task_id: id,
  description: id,
  acceptance_criteria: "ok",
  depends_on: deps,
});

async function waitUntil(pred: () => boolean, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitUntil timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

const temporalOn = process.env["TEMPORAL_INTEGRATION"] === "1";

let skipEnv: TestWorkflowEnvironment;
let localEnv: TestWorkflowEnvironment;

beforeAll(async () => {
  if (!temporalOn) return;
  skipEnv = await TestWorkflowEnvironment.createTimeSkipping();
  localEnv = await TestWorkflowEnvironment.createLocal();
}, 180_000);

afterAll(async () => {
  await skipEnv?.teardown();
  await localEnv?.teardown();
});

async function runWorkflow(
  env: TestWorkflowEnvironment,
  activities: BuildActivities,
  input: BuildRunInput,
  taskQueue: string,
) {
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
  it("runs a dependency chain in order, reviews, ships, and marks the run done", async () => {
    const cap = capture();
    const seen: string[] = [];
    const acts = mockActivities({
      graph: [node("c", ["b"]), node("b", ["a"]), node("a")],
      cap,
      run: (id) => {
        seen.push(id);
        return verified;
      },
    });
    const result = await runWorkflow(skipEnv, acts, RUN(), "q-order");
    expect(result.status).toBe("done");
    expect(result.tasksVerified).toBe(3);
    expect(seen).toEqual(["a", "b", "c"]);
    // M4 flow: building → reviewing → shipping → done.
    expect(cap.statuses).toEqual(["building", "reviewing", "shipping", "done"]);
    expect(cap.reviews).toBe(1);
    expect(cap.ships).toEqual([{ isPartial: false }]);
    expect(result.deliveries).toHaveLength(1);
  }, 60_000);

  it("recovers when a task fails twice then verifies on the last attempt", async () => {
    const cap = capture();
    const acts = mockActivities({
      graph: [node("a")],
      cap,
      run: (_id, attempt) => (attempt < 3 ? failed("test_failed" as never) : verified),
    });
    const result = await runWorkflow(skipEnv, acts, RUN(), "q-recover");
    expect(result.status).toBe("done");
    expect(cap.runCounts.get("a")).toBe(3);
    expect(cap.escalations).toEqual([]);
  }, 60_000);

  it("escalation times out → abandon → still reviews, ships partial, run failed (ADR-33)", async () => {
    const cap = capture();
    const acts = mockActivities({
      graph: [node("a")],
      cap,
      run: () => failed("test_failed" as never),
    });
    // No signal sent; time-skipping fast-forwards the 30-min gate → abandon.
    const result = await runWorkflow(skipEnv, acts, RUN(), "q-timeout");
    expect(result.status).toBe("failed");
    expect(cap.runCounts.get("a")).toBe(3); // 3 attempts, then the gate
    expect(cap.escalations).toEqual([{ specTaskId: "a", reason: "test_failed" }]);
    // ADR-33: a partial build still reviews (files may exist) and ships.
    expect(cap.ships).toEqual([{ isPartial: true }]);
  }, 60_000);

  it("skips tasks whose dependency was abandoned, ships partial", async () => {
    const cap = capture();
    const acts = mockActivities({
      graph: [node("a"), node("b", ["a"])],
      cap,
      run: (id) => (id === "a" ? failed("test_failed" as never) : verified),
    });
    const result = await runWorkflow(skipEnv, acts, RUN(), "q-skipdep");
    expect(result.status).toBe("failed");
    expect(cap.runCounts.get("b")).toBeUndefined(); // b skipped (dep a abandoned)
    expect(cap.ships).toEqual([{ isPartial: true }]);
  }, 60_000);

  it("diamond: skips the join when ONE of two dependencies is abandoned", async () => {
    const cap = capture();
    // a → {b, c} → d. c fails (→abandon on timeout); b verifies. d must skip.
    const acts = mockActivities({
      graph: [node("a"), node("b", ["a"]), node("c", ["a"]), node("d", ["b", "c"])],
      cap,
      run: (id) => (id === "c" ? failed("test_failed" as never) : verified),
    });
    const result = await runWorkflow(skipEnv, acts, RUN(), "q-diamond");
    expect(result.status).toBe("failed");
    expect(cap.runCounts.get("b")).toBe(1); // b DID run and verify
    expect(cap.runCounts.get("d")).toBeUndefined(); // d skipped (c incomplete)
    expect(cap.ships).toEqual([{ isPartial: true }]);
  }, 60_000);

  it("short-circuits on budget_exceeded (terminal, no gate)", async () => {
    const cap = capture();
    const acts = mockActivities({
      graph: [node("a")],
      cap,
      run: () => failed("budget_exceeded" as never),
    });
    const result = await runWorkflow(skipEnv, acts, RUN(), "q-be");
    expect(result.status).toBe("failed");
    expect(cap.runCounts.get("a")).toBe(1);
    expect(cap.escalations).toEqual([]); // terminal → no escalation
  }, 60_000);

  it("fails the run when the task_graph has a cycle (no review/ship)", async () => {
    const cap = capture();
    const acts = mockActivities({ graph: [node("a", ["b"]), node("b", ["a"])], cap, run: () => verified });
    const result = await runWorkflow(skipEnv, acts, RUN(), "q-cycle");
    expect(result.status).toBe("failed");
    expect(result.failedReason).toMatch(/cycle/);
    expect(cap.statuses).toEqual(["building", "failed"]);
    expect(cap.ships).toEqual([]);
  }, 60_000);

  it("marks the run failed (not stuck 'building') when an activity exhausts its retries", async () => {
    const cap = capture();
    const acts = mockActivities({ graph: [node("a")], cap, loadThrows: true, run: () => verified });
    const result = await runWorkflow(skipEnv, acts, RUN(), "q-infra");
    expect(result.status).toBe("failed");
    expect(cap.statuses).toContain("building");
    expect(cap.statuses.at(-1)).toBe("failed");
  }, 90_000);
});

describe.skipIf(!temporalOn)("escalation gate (human signal, real-time)", () => {
  async function runWithSignal(
    taskQueue: string,
    acts: BuildActivities,
    cap: MockCapture,
    decision: EscalationDecision,
    input = RUN({ runId: `run-${taskQueue}` }),
  ) {
    const worker = await Worker.create({
      connection: localEnv.nativeConnection,
      taskQueue,
      workflowsPath: WORKFLOWS_PATH,
      activities: acts,
    });
    const handle = await localEnv.client.workflow.start(buildRunWorkflow, {
      workflowId: `wf-${taskQueue}`,
      taskQueue,
      args: [input],
    });
    const runP = worker.runUntil(handle.result());
    await waitUntil(() => cap.escalations.length > 0);
    // Route the decision to the task actually at the gate (its specTaskId
    // rides on the escalation the workflow just published).
    await handle.signal(escalationSignal, {
      specTaskId: cap.escalations[cap.escalations.length - 1]!.specTaskId,
      decision,
    });
    return runP;
  }

  it("approve → task accepted-incomplete, build continues to dependents", async () => {
    const cap = capture();
    const acts = mockActivities({
      graph: [node("a"), node("b", ["a"])],
      cap,
      run: (id) => (id === "a" ? failed("test_failed" as never) : verified),
    });
    const result = await runWithSignal("q-approve", acts, cap, "approve");
    // a accepted-incomplete counts as complete for deps → b runs.
    expect(cap.runCounts.get("b")).toBe(1);
    expect(cap.ships).toEqual([{ isPartial: true }]); // a not verified → partial
    expect(result.status).toBe("failed");
  }, 90_000);

  it("abandon → task dropped, dependents skipped, ships partial", async () => {
    const cap = capture();
    const acts = mockActivities({
      graph: [node("a"), node("b", ["a"])],
      cap,
      run: (id) => (id === "a" ? failed("test_failed" as never) : verified),
    });
    await runWithSignal("q-abandon", acts, cap, "abandon");
    expect(cap.runCounts.get("b")).toBeUndefined();
    expect(cap.ships).toEqual([{ isPartial: true }]);
  }, 90_000);

  it("redirect → task re-run with the operator instruction, then verifies", async () => {
    const cap = capture();
    const acts = mockActivities({
      graph: [node("a")],
      cap,
      // Fails until a redirect instruction is present, then verifies.
      run: (_id, _attempt, redirect) => (redirect ? verified : failed("test_failed" as never)),
    });
    const result = await runWithSignal("q-redirect", acts, cap, { redirect: "use a different approach" });
    expect(result.status).toBe("done");
    expect(cap.redirects).toContain("use a different approach");
  }, 90_000);

  it("ignores a decision tagged for a different task (Phase 3 audit)", async () => {
    // Only task "a" ever gates. A decision addressed to a non-gated task "z"
    // must NOT be consumed by a's gate — if it were (the old single-slot
    // bug), a would abandon. Send the mis-tagged "abandon" first, then the
    // correctly-tagged "approve"; a must end accepted-incomplete, so b runs.
    const cap = capture();
    const acts = mockActivities({
      graph: [node("a"), node("b", ["a"])],
      cap,
      run: (id) => (id === "a" ? failed("test_failed" as never) : verified),
    });
    const worker = await Worker.create({
      connection: localEnv.nativeConnection,
      taskQueue: "q-mistag",
      workflowsPath: WORKFLOWS_PATH,
      activities: acts,
    });
    const handle = await localEnv.client.workflow.start(buildRunWorkflow, {
      workflowId: "wf-q-mistag",
      taskQueue: "q-mistag",
      args: [RUN({ runId: "run-mistag" })],
    });
    const runP = worker.runUntil(handle.result());
    await waitUntil(() => cap.escalations.length > 0);
    // Wrong task id — must be ignored by a's gate.
    await handle.signal(escalationSignal, { specTaskId: "z", decision: "abandon" });
    // Correct task id — this is the one a's gate must act on.
    await handle.signal(escalationSignal, { specTaskId: "a", decision: "approve" });
    const result = await runP;
    expect(cap.runCounts.get("b")).toBe(1); // a accepted-incomplete → b ran
    expect(result.status).toBe("failed"); // a not verified → partial
  }, 90_000);

  it("caps redirects at MAX_REDIRECTS then abandons", async () => {
    const cap = capture();
    const taskQueue = "q-maxredirect";
    // Always fails, even with a redirect → each gate gets another redirect
    // until the cap, then abandon.
    const acts = mockActivities({ graph: [node("a")], cap, run: () => failed("test_failed" as never) });
    const worker = await Worker.create({
      connection: localEnv.nativeConnection,
      taskQueue,
      workflowsPath: WORKFLOWS_PATH,
      activities: acts,
    });
    const handle = await localEnv.client.workflow.start(buildRunWorkflow, {
      workflowId: `wf-${taskQueue}`,
      taskQueue,
      args: [RUN({ runId: "run-maxredirect" })],
    });
    const runP = worker.runUntil(handle.result());
    // Re-signal redirect on each new escalation until the workflow finishes.
    let sent = 0;
    let done = false;
    runP.then(() => (done = true)).catch(() => (done = true));
    while (!done && sent < 5) {
      await waitUntil(() => cap.escalations.length > sent || done);
      if (done) break;
      await handle
        .signal(escalationSignal, {
          specTaskId: cap.escalations[cap.escalations.length - 1]!.specTaskId,
          decision: { redirect: `try ${sent}` },
        })
        .catch(() => undefined);
      sent += 1;
    }
    const result = await runP;
    expect(result.status).toBe("failed"); // abandoned after the cap → partial
    // MAX_REDIRECTS = 2 → 3 escalation gates (initial + 2 redirects).
    expect(cap.escalations.length).toBe(3);
    expect(cap.ships).toEqual([{ isPartial: true }]);
  }, 120_000);
});

describe.skipIf(!temporalOn)("durable crash-resume (the M3 DoD)", () => {
  it("does NOT re-run a completed task after the worker is replaced", async () => {
    const cap = capture();
    const taskQueue = "q-crash";
    const input = RUN({ runId: "run-crash" });
    let resolveADone: () => void;
    const aDone = new Promise<void>((r) => {
      resolveADone = r;
    });
    const acts = mockActivities({
      graph: [node("a"), node("b", ["a"])],
      cap,
      run: (id) => {
        if (id === "a") resolveADone();
        return verified;
      },
    });

    const worker1 = await Worker.create({
      connection: localEnv.nativeConnection,
      taskQueue,
      workflowsPath: WORKFLOWS_PATH,
      activities: acts,
    });
    const handle = await localEnv.client.workflow.start(buildRunWorkflow, {
      workflowId: "wf-crash",
      taskQueue,
      args: [input],
    });
    await worker1.runUntil(aDone);

    const worker2 = await Worker.create({
      connection: localEnv.nativeConnection,
      taskQueue,
      workflowsPath: WORKFLOWS_PATH,
      activities: acts,
    });
    const result = await worker2.runUntil(handle.result());

    expect(result.status).toBe("done");
    expect(cap.runCounts.get("a")).toBe(1); // completed task NOT re-run
    expect(cap.runCounts.get("b")).toBeGreaterThanOrEqual(1);
  }, 120_000);
});

async function dockerUp(): Promise<boolean> {
  try {
    await resolveDocker();
    return true;
  } catch {
    return false;
  }
}
const dockerAvailable = await dockerUp();

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
    const llm = new ScriptedLlm([
      { toolCalls: [toolCall("c1", "writeFile", { path: "sum.js", content: "exports.sum=(a,b)=>a+b;" })] },
      {
        toolCalls: [
          toolCall("c2", "writeFile", {
            path: "sum.test.js",
            content: [
              "const {test}=require('node:test');const a=require('node:assert');",
              "const {sum}=require('../sum.js');",
              "test('adds',()=>a.strictEqual(sum(2,3),5));",
            ].join(""),
          }),
        ],
      },
      { toolCalls: [toolCall("c3", "submit", {})] },
    ]);

    const cap = capture();
    const real = createActivities({
      db: pipelineDb(),
      llm,
      driver: new LocalDockerDriver(),
      sandboxCostPerSec: 0.000042,
    });
    const activities: BuildActivities = {
      ...real,
      async loadTaskGraphActivity() {
        return graph;
      },
      async ensureTaskRowActivity({ node: n }) {
        return { taskRowId: `row-${n.task_id}` };
      },
      async setRunStatusActivity({ status }) {
        cap.statuses.push(status);
      },
      async reviewActivity() {
        cap.reviews += 1;
        return { approved: true, blockerCount: 0 };
      },
      async shipActivity({ isPartial }) {
        cap.ships.push({ isPartial });
        return { deliveries: [{ kind: "archive", ref: "fake://archive" }] };
      },
    };

    const result = await runWorkflow(localEnv, activities, RUN({ runId: "run-pipe" }), "q-pipeline");
    expect(result.status).toBe("done");
    expect(result.tasksVerified).toBe(1);
    expect(cap.reviews).toBe(1);
    expect(cap.ships).toEqual([{ isPartial: false }]);
  }, 180_000);
});
