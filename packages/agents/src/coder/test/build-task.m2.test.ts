import { describe, expect, it } from "vitest";
import type { Db } from "@mullion/db";
import { FakeSandbox } from "@mullion/sandbox/testing";
import type { AgentMessageEnvelope } from "@mullion/schemas";
import { DEFAULT_TASK_CAPS, buildTask, type BuildTaskInput } from "../build-task.js";
import type { Verifier } from "../verify.js";
import { SandboxError } from "@mullion/sandbox";
import { ScriptedLlm, toolCall } from "../__fixtures__/scripted-llm.js";

// M2: pass/fail feedback via an injected Verifier, plus the ADR-31 budget
// breaker. Verified against FakeSandbox + scripted LLM; the real fresh-sandbox
// tamper-proofing is proven in the Docker integration test.

interface Recorded {
  messages: AgentMessageEnvelope[];
  taskStatuses: Array<{ status: string; result?: unknown }>;
  costEvents: unknown[];
}
function fakeDb(recorded: Recorded, budgetSums?: number[]): Db {
  let sumCursor = 0;
  return {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        if ("envelope" in values) recorded.messages.push(values["envelope"] as AgentMessageEnvelope);
        else recorded.costEvents.push(values);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (values: { status: string; result?: unknown }) => ({
        where: () => {
          recorded.taskStatuses.push(values);
          return Promise.resolve();
        },
      }),
    }),
    // budget queries: select().from().where() → [{ total }]
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ total: String(budgetSums?.[sumCursor++] ?? 0) }]),
      }),
    }),
  } as unknown as Db;
}

function input(overrides?: Partial<BuildTaskInput>): BuildTaskInput {
  return {
    task: { taskId: "T1", description: "impl", acceptanceCriteria: "tests pass" },
    verifyCommand: "node --test",
    caps: { ...DEFAULT_TASK_CAPS, maxTurns: 12, maxTestFixCycles: 3, commandTimeoutMs: 5_000 },
    costContext: { organizationId: "org-1", runId: "run-1" },
    organizationId: "org-1",
    runId: "run-1",
    taskRowId: "task-1",
    ...overrides,
  };
}

/** A verifier that fails the first `failTimes` calls, then passes. */
function cyclingVerifier(failTimes: number): Verifier {
  let calls = 0;
  return async () => {
    calls += 1;
    const passed = calls > failTimes;
    return {
      passed,
      exitCode: passed ? 0 : 1,
      feedback: passed ? "ok" : `failure round ${calls}`,
      costUsd: 0.01,
      report: { failures: passed ? [] : [`round ${calls} failed`], summary: passed ? "green" : "red" },
    };
  };
}

describe("buildTask M2 — feedback loop + budget", () => {
  it("feeds Tester failures back and converges within the fix-cycle budget", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const llm = new ScriptedLlm([
      { toolCalls: [toolCall("c1", "writeFile", { path: "a.js", content: "v1" })] },
      { toolCalls: [toolCall("c2", "submit", {})] }, // fail 1 → feedback
      { toolCalls: [toolCall("c3", "writeFile", { path: "a.js", content: "v2" })] },
      { toolCalls: [toolCall("c4", "submit", {})] }, // pass
    ]);
    const result = await buildTask(input(), {
      sandbox: new FakeSandbox(),
      llm,
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
      verify: cyclingVerifier(1),
    });
    expect(result.status).toBe("verified");
    // Two test_report envelopes recorded (fail, then pass).
    const reports = recorded.messages.filter((m) => m.kind === "test_report");
    expect(reports).toHaveLength(2);
    expect((reports[0] as { passed: boolean }).passed).toBe(false);
    expect((reports[1] as { passed: boolean }).passed).toBe(true);
    // Verifier cost is folded into the task cost (ADR-49): 2 calls × 0.01.
    expect((reports[0] as { costUsd: number }).costUsd).toBe(0.01);
    expect(result.costUsd).toBeGreaterThanOrEqual(0.02);
    // The Tester's failure feedback actually reached the Coder as a tool_result.
    const submitFeedback = recorded.messages.find(
      (m): m is Extract<AgentMessageEnvelope, { kind: "tool_result" }> =>
        m.kind === "tool_result" && m.toolName === "submit" && !m.ok,
    );
    expect(submitFeedback?.content).toContain("round 1");
  });

  it("trips the ADR-31 budget at the PRE-VERIFY gate", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    // First budget check (pre-call turn 1) sees 0; the pre-verify check sees 5 ≥ run cap.
    const result = await buildTask(input(), {
      sandbox: new FakeSandbox(),
      llm: new ScriptedLlm([{ toolCalls: [toolCall("c1", "submit", {})] }]),
      db: fakeDb(recorded, [0, 0, 5, 0]),
      sandboxCostPerSec: 0.0001,
      budget: { runBudgetUsd: 1, orgBudgetUsd: 100 },
      verify: cyclingVerifier(0),
    });
    expect(result).toMatchObject({ status: "failed", reason: "budget_exceeded" });
  });

  it("trips the ORG-scope budget mid-loop", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    // run-sum 0.1 (ok) but org-window-sum 12 ≥ org cap 10.
    const result = await buildTask(input(), {
      sandbox: new FakeSandbox(),
      llm: new ScriptedLlm([{ toolCalls: [toolCall("c1", "submit", {})] }]),
      db: fakeDb(recorded, [0.1, 12]),
      sandboxCostPerSec: 0.0001,
      budget: { runBudgetUsd: 100, orgBudgetUsd: 10 },
    });
    expect(result).toMatchObject({ status: "failed", reason: "budget_exceeded" });
  });

  it("classifies a verifier sandbox death as sandbox_died", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const dyingVerify: Verifier = async () => {
      throw new SandboxError({ kind: "container_died", message: "verify sandbox OOM", retryable: true });
    };
    const result = await buildTask(input(), {
      sandbox: new FakeSandbox(),
      llm: new ScriptedLlm([{ toolCalls: [toolCall("c1", "submit", {})] }]),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
      verify: dyingVerify,
    });
    expect(result).toMatchObject({ status: "failed", reason: "sandbox_died" });
  });

  it("treats a verifier timeout as signal and keeps looping", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    let calls = 0;
    const flakyVerify: Verifier = async () => {
      calls += 1;
      if (calls === 1) {
        throw new SandboxError({ kind: "timeout", message: "verify timed out", retryable: false });
      }
      return { passed: true, exitCode: 0, feedback: "ok", costUsd: 0 };
    };
    const result = await buildTask(input(), {
      sandbox: new FakeSandbox(),
      llm: new ScriptedLlm([
        { toolCalls: [toolCall("c1", "submit", {})] },
        { toolCalls: [toolCall("c2", "submit", {})] },
      ]),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
      verify: flakyVerify,
    });
    expect(result.status).toBe("verified");
  });

  it("fails as test_failed when the fix-cycle budget is exhausted", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    // Always submits, verifier always fails → exhausts 3 cycles.
    const llm = new ScriptedLlm(
      Array.from({ length: 8 }, (_, i) => ({ toolCalls: [toolCall(`c${i}`, "submit", {})] })),
    );
    const result = await buildTask(input(), {
      sandbox: new FakeSandbox(),
      llm,
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
      verify: cyclingVerifier(99),
    });
    expect(result).toMatchObject({ status: "failed", reason: "test_failed" });
    expect(recorded.messages.filter((m) => m.kind === "test_report")).toHaveLength(3);
  });

  it("trips the ADR-31 budget breaker before the first turn when the run is already over", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const result = await buildTask(input(), {
      sandbox: new FakeSandbox(),
      llm: new ScriptedLlm([{ toolCalls: [toolCall("c1", "submit", {})] }]),
      // run-sum already 5 ≥ runBudget 1
      db: fakeDb(recorded, [5, 0]),
      sandboxCostPerSec: 0.0001,
      budget: { runBudgetUsd: 1, orgBudgetUsd: 100 },
    });
    expect(result).toMatchObject({ status: "failed", reason: "budget_exceeded" });
  });

  it("passes the budget check and proceeds when under ceiling", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const result = await buildTask(input(), {
      sandbox: new FakeSandbox(),
      llm: new ScriptedLlm([{ toolCalls: [toolCall("c1", "submit", {})] }]),
      db: fakeDb(recorded, [0, 0, 0, 0]),
      sandboxCostPerSec: 0.0001,
      budget: { runBudgetUsd: 100, orgBudgetUsd: 100 },
      verify: cyclingVerifier(0),
    });
    expect(result.status).toBe("verified");
  });
});
