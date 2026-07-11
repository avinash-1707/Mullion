import { describe, expect, it, vi } from "vitest";
import { MockActivityEnvironment } from "@temporalio/testing";
import type { Db } from "@mullion/db";
import { FakeSandbox } from "@mullion/sandbox/testing";
import type { Sandbox, SandboxDriver } from "@mullion/sandbox";
import { ScriptedLlm, toolCall } from "@mullion/agents/testing";
import type { ToolCallingLlm } from "@mullion/agents";
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
});
