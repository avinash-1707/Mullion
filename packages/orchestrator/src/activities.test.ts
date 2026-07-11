import { describe, expect, it, vi } from "vitest";
import { MockActivityEnvironment } from "@temporalio/testing";
import type { Db } from "@mullion/db";
import { FakeSandbox } from "@mullion/sandbox/testing";
import type { RunCommandOptions, Sandbox, SandboxDriver } from "@mullion/sandbox";
import { ScriptedLlm, toolCall } from "@mullion/agents/testing";
import type { OneShotLlm, ToolCallingLlm } from "@mullion/agents";
import { InMemoryArtifactStore } from "@mullion/artifacts/testing";
import { FakeArchiveDeliveryTarget, FakeGitHubDeliveryTarget } from "@mullion/delivery/testing";
import { createActivities, type ActivityDeps } from "./activities.js";

// Binary-free unit tier: activities that don't need Postgres predicate
// introspection (status write + escalation publish) are exercised with a
// minimal fake db. ensureTaskRow idempotency and loadTaskGraph run against
// real Postgres in the integration tier.

function fakeDb(runStatuses: string[]): Db {
  return {
    update: () => ({ set: (v: { status: string }) => ({ where: () => {
      runStatuses.push(v.status);
      return Promise.resolve();
    } }) }),
  } as unknown as Db;
}

function deps(db: Db, publishEvent?: ActivityDeps["publishEvent"]): ActivityDeps {
  return {
    db,
    llm: {} as ToolCallingLlm,
    driver: {} as SandboxDriver,
    sandboxCostPerSec: 0.0001,
    ...(publishEvent ? { publishEvent } : {}),
  };
}

describe("setRunStatusActivity", () => {
  it("writes the status and publishes a phase event", async () => {
    const runStatuses: string[] = [];
    const published: Array<{ eventType: string }> = [];
    const acts = createActivities(
      deps(fakeDb(runStatuses), async (_d, a) => {
        published.push({ eventType: a.eventType });
      }),
    );
    const env = new MockActivityEnvironment();
    await env.run(acts.setRunStatusActivity, {
      runId: "run-1",
      organizationId: "org-1",
      status: "building" as const,
    });
    expect(runStatuses).toContain("building");
    expect(published).toEqual([{ eventType: "phase" }]);
  });
});

describe("publishEscalationActivity", () => {
  it("emits an escalation_required event with the task + reason", async () => {
    const published: Array<{ eventType: string; payload: unknown }> = [];
    const acts = createActivities(
      deps(fakeDb([]), async (_d, a) => {
        published.push({ eventType: a.eventType, payload: a.payload });
      }),
    );
    await acts.publishEscalationActivity({
      runId: "run-1",
      organizationId: "org-1",
      specTaskId: "t1",
      reason: "test_failed",
    });
    expect(published[0]?.eventType).toBe("escalation_required");
    expect(published[0]?.payload).toMatchObject({ specTaskId: "t1", reason: "test_failed" });
  });

  it("is a no-op when no publisher is wired", async () => {
    const acts = createActivities(deps(fakeDb([])));
    await expect(
      acts.publishEscalationActivity({
        runId: "r",
        organizationId: "o",
        specTaskId: "t",
        reason: "crashed",
      }),
    ).resolves.toBeUndefined();
  });
});

/** Fake db serving runTaskActivity: task-row read + no-op writes. */
function runTaskDb(taskRow: { description: string; acceptanceCriteria: string; verifyCommand: string } | null): Db {
  return {
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    insert: () => ({ values: () => Promise.resolve() }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(taskRow ? [taskRow] : []) }),
      }),
    }),
  } as unknown as Db;
}

function runTaskDeps(db: Db, driver: SandboxDriver): ActivityDeps {
  return {
    db,
    llm: new ScriptedLlm([{ toolCalls: [toolCall("c1", "submit", {})] }]) as unknown as ToolCallingLlm,
    driver,
    sandboxCostPerSec: 0.0001,
  };
}

describe("runTaskActivity lifecycle", () => {
  const args = {
    runId: "run-1",
    organizationId: "org-1",
    userId: "user-1",
    taskRowId: "task-1",
    specTaskId: "t1",
    attempt: 1,
  };

  it("disposes the sandbox after the task completes", async () => {
    const sandbox = new FakeSandbox(); // default runCommand → exit 0, verify passes
    const disposeSpy = vi.spyOn(sandbox, "dispose");
    const driver: SandboxDriver = { name: "local", create: async (): Promise<Sandbox> => sandbox };
    const acts = createActivities(
      runTaskDeps(runTaskDb({ description: "d", acceptanceCriteria: "a", verifyCommand: "true" }), driver),
    );
    const env = new MockActivityEnvironment();
    const result = (await env.run(acts.runTaskActivity, args)) as { status: string };
    expect(result.status).toBe("verified");
    expect(disposeSpy).toHaveBeenCalledTimes(1);
  });

  it("fails non-retryably and never creates a sandbox when the task row is missing", async () => {
    const create = vi.fn();
    const driver = { name: "local" as const, create };
    const acts = createActivities(runTaskDeps(runTaskDb(null), driver as unknown as SandboxDriver));
    const env = new MockActivityEnvironment();
    await expect(env.run(acts.runTaskActivity, args)).rejects.toMatchObject({
      nonRetryable: true,
    });
    expect(create).not.toHaveBeenCalled(); // no sandbox to leak
  });

  it("snapshots produced files into the artifact store before dispose", async () => {
    const store = new InMemoryArtifactStore();
    const sandbox = new FakeSandbox((_cmd: string, _o: RunCommandOptions) => ({
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    }));
    // Coder writes a file, then submits → inline verify passes → producedPaths
    // = ["sum.js"], which runTaskActivity snapshots into the store.
    const scripted = new ScriptedLlm([
      { toolCalls: [toolCall("c1", "writeFile", { path: "sum.js", content: "exports.sum=(a,b)=>a+b" })] },
      { toolCalls: [toolCall("c2", "submit", {})] },
    ]);
    const acts = createActivities({
      db: runTaskDb({ description: "d", acceptanceCriteria: "a", verifyCommand: "true" }),
      llm: scripted as unknown as ToolCallingLlm,
      driver: { name: "local", create: async (): Promise<Sandbox> => sandbox },
      sandboxCostPerSec: 0.0001,
      artifactStore: store,
    });
    const env = new MockActivityEnvironment();
    const result = (await env.run(acts.runTaskActivity, args)) as { status: string };
    expect(result.status).toBe("verified");
    expect(await store.readTree("run-1")).toEqual([{ path: "sum.js", content: "exports.sum=(a,b)=>a+b" }]);
  });
});

/** Fake db that returns queued select results in call order, capturing inserts. */
function queueDb(selectResults: unknown[][], inserts: Record<string, unknown[]>): Db {
  let i = 0;
  const table = (values: Record<string, unknown>): string =>
    "kind" in values ? "deliveries" : "actor" in values ? "decisionLog" : "other";
  return {
    select: () => ({
      from: () => ({
        where: () => {
          const chain = {
            limit: () => Promise.resolve(selectResults[i++] ?? []),
            then: (res: (v: unknown[]) => void) => res(selectResults[i++] ?? []),
          };
          return chain;
        },
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        (inserts[table(v)] ??= []).push(v);
        return Promise.resolve();
      },
    }),
  } as unknown as Db;
}

describe("reviewActivity", () => {
  const args = { runId: "run-1", organizationId: "org-1", buildSpecId: "spec-1" };

  it("degrades to auto-approve when no reviewer LLM or store is wired", async () => {
    const inserts: Record<string, unknown[]> = {};
    const acts = createActivities({
      db: queueDb([], inserts),
      llm: {} as ToolCallingLlm,
      driver: {} as SandboxDriver,
      sandboxCostPerSec: 0.0001,
    });
    const env = new MockActivityEnvironment();
    const result = (await env.run(acts.reviewActivity, args)) as { approved: boolean };
    expect(result.approved).toBe(true);
    expect(inserts.decisionLog).toBeUndefined(); // wrote nothing
  });

  it("runs the reviewer, records the verdict, and counts blockers", async () => {
    const store = new InMemoryArtifactStore();
    await store.put("run-1", [{ path: "sum.js", content: "exports.sum=(a,b)=>a+b" }]);
    const inserts: Record<string, unknown[]> = {};
    const published: Array<{ eventType: string }> = [];
    const reviewLlm: OneShotLlm = {
      completeChat: async () => ({
        content: JSON.stringify({
          approved: false,
          notes: [
            { severity: "blocker", message: "missing export", paths: ["sum.js"] },
            { severity: "concern", message: "no tests", paths: [] },
          ],
        }),
        model: "test/reviewer",
        generationId: "g",
        cost: 0.001,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
    };
    const acts = createActivities({
      db: queueDb(
        [
          [{ spec: { requirements: { summary: "sum lib" }, task_graph: [] } }], // buildSpecs
          [{ specTaskId: "t1", acceptanceCriteria: "sum works", status: "verified" }], // tasks
          [{ actor: "planner", decision: "expose sum" }], // decisionLog
        ],
        inserts,
      ),
      llm: {} as ToolCallingLlm,
      driver: {} as SandboxDriver,
      sandboxCostPerSec: 0.0001,
      artifactStore: store,
      reviewLlm,
      publishEvent: async (_d, a) => {
        published.push({ eventType: a.eventType });
      },
    });
    const env = new MockActivityEnvironment();
    const result = (await env.run(acts.reviewActivity, args)) as { approved: boolean; blockerCount: number };
    expect(result.approved).toBe(false);
    expect(result.blockerCount).toBe(1);
    expect(inserts.decisionLog?.[0]).toMatchObject({ actor: "reviewer", phase: "build" });
    expect(published).toEqual([{ eventType: "review_result" }]);
  });
});

describe("shipActivity", () => {
  const args = { runId: "run-1", organizationId: "org-1", userId: "user-1", isPartial: false, summary: "built" };

  it("delivers to every available target, skips unavailable, records rows, publishes", async () => {
    const store = new InMemoryArtifactStore();
    await store.put("run-1", [{ path: "sum.js", content: "x" }]);
    const inserts: Record<string, unknown[]> = {};
    const published: Array<{ eventType: string; payload: unknown }> = [];
    const archive = new FakeArchiveDeliveryTarget();
    const github = new FakeGitHubDeliveryTarget(); // NOT connected → unavailable
    const acts = createActivities({
      db: queueDb([[]], inserts), // no existing deliveries
      llm: {} as ToolCallingLlm,
      driver: {} as SandboxDriver,
      sandboxCostPerSec: 0.0001,
      artifactStore: store,
      deliveryTargets: [archive, github],
      publishEvent: async (_d, a) => {
        published.push({ eventType: a.eventType, payload: a.payload });
      },
    });
    const env = new MockActivityEnvironment();
    const result = (await env.run(acts.shipActivity, args)) as { deliveries: unknown[] };
    expect(result.deliveries).toEqual([{ kind: "archive", ref: "fake://archive/mullion-build-run1.zip" }]);
    expect(archive.archives.get("mullion-build-run1")?.some((f) => f.path === "sum.js")).toBe(true);
    expect(inserts.deliveries).toHaveLength(1); // only the archive row
    expect(published[0]?.eventType).toBe("delivery_result");
  });

  it("skips a kind already delivered (idempotent across retries)", async () => {
    const store = new InMemoryArtifactStore();
    const inserts: Record<string, unknown[]> = {};
    const archive = new FakeArchiveDeliveryTarget();
    const acts = createActivities({
      db: queueDb([[{ kind: "archive" }]], inserts), // archive already delivered
      llm: {} as ToolCallingLlm,
      driver: {} as SandboxDriver,
      sandboxCostPerSec: 0.0001,
      artifactStore: store,
      deliveryTargets: [archive],
    });
    const env = new MockActivityEnvironment();
    const result = (await env.run(acts.shipActivity, args)) as { deliveries: unknown[] };
    expect(result.deliveries).toEqual([]); // skipped
    expect(inserts.deliveries).toBeUndefined();
  });

  it("one target throwing does not abort the others", async () => {
    const store = new InMemoryArtifactStore();
    const inserts: Record<string, unknown[]> = {};
    const archive = new FakeArchiveDeliveryTarget();
    const brokenGithub = new FakeGitHubDeliveryTarget(new Set(["user-1"])); // available but...
    brokenGithub.deliver = async () => {
      throw new Error("github 422");
    };
    const acts = createActivities({
      db: queueDb([[]], inserts),
      llm: {} as ToolCallingLlm,
      driver: {} as SandboxDriver,
      sandboxCostPerSec: 0.0001,
      artifactStore: store,
      deliveryTargets: [brokenGithub, archive],
    });
    const env = new MockActivityEnvironment();
    const result = (await env.run(acts.shipActivity, args)) as { deliveries: Array<{ kind: string }> };
    // github threw, archive still delivered.
    expect(result.deliveries.map((d) => d.kind)).toEqual(["archive"]);
  });
});
