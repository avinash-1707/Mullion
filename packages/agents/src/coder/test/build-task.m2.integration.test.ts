import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CompleteChatResult } from "@mullion/llm";
import { LocalDockerDriver, resolveDocker, type Sandbox } from "@mullion/sandbox";
import type { Db } from "@mullion/db";
import { buildTask, DEFAULT_TASK_CAPS, type BuildTaskInput } from "../build-task.js";
import { makeTesterVerifier, type OneShotLlm } from "../../tester/verify.js";
import { ScriptedLlm, toolCall } from "../__fixtures__/scripted-llm.js";

/**
 * The M2 proof (ADR-48 closes ADR-46): verification runs in a FRESH Docker
 * sandbox against RUNNER-OWNED tests, so a Coder that plants its own passing
 * test file cannot fake "verified" — the runner's test overwrites it and the
 * real assertion runs. Skips visibly without Docker; refuses to skip under
 * SANDBOX_INTEGRATION=1.
 */

async function dockerAvailable(): Promise<boolean> {
  try {
    await resolveDocker();
    return true;
  } catch {
    return false;
  }
}
const available = await dockerAvailable();
if (!available && process.env["SANDBOX_INTEGRATION"] === "1") {
  throw new Error("SANDBOX_INTEGRATION=1 but the Docker daemon is unreachable — refusing to skip");
}

// Tester parse is cosmetic here — the real Docker exit code decides pass/fail.
const fakeTesterLlm: OneShotLlm = {
  completeChat: async (): Promise<CompleteChatResult> => ({
    content: JSON.stringify({ summary: "parsed", failures: ["sum was wrong"] }),
    model: "fake/tester",
    generationId: "g",
    cost: 0,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  }),
};

const RUNNER_TEST = {
  path: "sum.test.js",
  content: [
    "const { test } = require('node:test');",
    "const assert = require('node:assert');",
    "const { sum } = require('./sum.js');",
    "test('sum adds', () => { assert.strictEqual(sum(2, 3), 5); });",
  ].join("\n"),
};

function noopDb(envelopes: unknown[] = []): Db {
  return {
    insert: () => ({
      values: (v: { envelope?: unknown }) => {
        if (v.envelope) envelopes.push(v.envelope);
        return Promise.resolve();
      },
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    select: () => ({ from: () => ({ where: () => Promise.resolve([{ total: "0" }]) }) }),
  } as unknown as Db;
}

function baseInput(overrides?: Partial<BuildTaskInput>): BuildTaskInput {
  return {
    task: { taskId: "M2", description: "implement sum(a,b)", acceptanceCriteria: "node --test passes" },
    verifyCommand: "node --test sum.test.js",
    caps: { ...DEFAULT_TASK_CAPS, maxTestFixCycles: 2, commandTimeoutMs: 60_000 },
    costContext: { organizationId: "org-it", runId: "run-it" },
    organizationId: "org-it",
    runId: "run-it",
    taskRowId: "task-it",
    ...overrides,
  };
}

describe.skipIf(!available)("M2 fresh-sandbox verification (integration)", () => {
  const driver = new LocalDockerDriver();
  let buildSandbox: Sandbox;

  beforeAll(async () => {
    buildSandbox = await driver.create({ timeoutMs: 5 * 60_000, runId: "run-it-build" });
  }, 180_000);

  afterAll(async () => {
    await buildSandbox?.dispose();
  });

  const verify = makeTesterVerifier({
    driver,
    llm: fakeTesterLlm,
    runnerTests: [RUNNER_TEST],
    testCommand: "node --test sum.test.js",
    sandboxTimeoutMs: 2 * 60_000,
    db: noopDb(),
    sandboxCostPerSec: 0.000042,
  });

  it("a Coder that plants a fake passing test still FAILS (cheat overwritten by runner test)", async () => {
    // Wrong impl + a planted test that would pass on its own.
    const llm = new ScriptedLlm([
      { toolCalls: [toolCall("c1", "writeFile", { path: "sum.js", content: "exports.sum=(a,b)=>a-b;" })] },
      {
        toolCalls: [
          toolCall("c2", "writeFile", {
            path: "sum.test.js",
            content: "const {test}=require('node:test'); test('cheat',()=>{});",
          }),
        ],
      },
      { toolCalls: [toolCall("c3", "submit", {})] },
      { toolCalls: [toolCall("c4", "submit", {})] }, // still refuses to fix → exhaust cycles
    ]);

    const envelopes: unknown[] = [];
    const result = await buildTask(baseInput(), {
      sandbox: buildSandbox,
      llm,
      db: noopDb(envelopes),
      sandboxCostPerSec: 0.000042,
      verify,
    });

    // The cheat did NOT produce a verified result — the runner's real test ran.
    expect(result).toMatchObject({ status: "failed", reason: "test_failed" });
    // And it ran for the RIGHT reason: a test_report with a NON-ZERO exit
    // from the runner-owned assertion (the honest-converge test proves the
    // same machinery reaches exit 0 on correct code, so a non-zero here is
    // the real `sum(2,3)!==5` assertion failing, not missing node/require).
    const reports = envelopes.filter(
      (e): e is { kind: string; passed: boolean; exitCode: number } =>
        typeof e === "object" && e !== null && (e as { kind?: string }).kind === "test_report",
    );
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.every((r) => r.passed === false && r.exitCode !== 0)).toBe(true);
  }, 120_000);

  it("an honest Coder converges: wrong impl → runner test fails → fix → verified", async () => {
    const fresh = await driver.create({ timeoutMs: 5 * 60_000, runId: "run-it-honest" });
    try {
      const llm = new ScriptedLlm([
        { toolCalls: [toolCall("c1", "writeFile", { path: "sum.js", content: "exports.sum=(a,b)=>a-b;" })] },
        { toolCalls: [toolCall("c2", "submit", {})] }, // real runner test fails
        { toolCalls: [toolCall("c3", "writeFile", { path: "sum.js", content: "exports.sum=(a,b)=>a+b;" })] },
        { toolCalls: [toolCall("c4", "submit", {})] }, // passes
      ]);
      const result = await buildTask(
        baseInput({ costContext: { organizationId: "org-it", runId: "run-it-honest" } }),
        { sandbox: fresh, llm, db: noopDb(), sandboxCostPerSec: 0.000042, verify },
      );
      expect(result.status).toBe("verified");
    } finally {
      await fresh.dispose();
    }
  }, 120_000);
});
