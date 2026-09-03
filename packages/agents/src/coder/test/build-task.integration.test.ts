import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@mullion/db";
import { LocalDockerDriver, resolveDocker, type Sandbox } from "@mullion/sandbox";
import { agentMessageEnvelopeSchema } from "@mullion/schemas";
import { buildTask, DEFAULT_TASK_CAPS } from "../build-task.js";
import { ScriptedLlm, toolCall } from "../__fixtures__/scripted-llm.js";

/**
 * The M1 proof: a scripted Coder transcript (LLM mocked — no creds exist)
 * driving a REAL Docker sandbox through the full loop, verified by a real
 * `node --test` run inside the container. Real filesystem, real exit codes
 * — the execution substrate is not a mock. Skips visibly without Docker;
 * refuses to skip under SANDBOX_INTEGRATION=1.
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

function fakeDb(sink: { envelopes: unknown[]; statuses: string[] }): Db {
  return {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        if ("envelope" in values) sink.envelopes.push(agentMessageEnvelopeSchema.parse(values["envelope"]));
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (values: { status: string }) => ({
        where: () => {
          sink.statuses.push(values.status);
          return Promise.resolve();
        },
      }),
    }),
  } as unknown as Db;
}

describe.skipIf(!available)("buildTask against a real Docker sandbox (integration)", () => {
  const driver = new LocalDockerDriver();
  let sandbox: Sandbox;

  beforeAll(async () => {
    sandbox = await driver.create({ timeoutMs: 5 * 60_000, runId: "itest-buildtask" });
  }, 180_000);

  afterAll(async () => {
    await sandbox?.dispose();
  });

  it("recovers from a real failing test and converges to verified-green", async () => {
    const sink = { envelopes: [] as unknown[], statuses: [] as string[] };

    const brokenAdd = "exports.add = (a, b) => a - b;"; // deliberate bug
    const fixedAdd = "exports.add = (a, b) => a + b;";
    const testFile = [
      "const { test } = require('node:test');",
      "const assert = require('node:assert');",
      "const { add } = require('../add.js');",
      "test('adds', () => { assert.strictEqual(add(2, 2), 4); });",
    ].join("\n");

    const llm = new ScriptedLlm([
      { toolCalls: [toolCall("c1", "writeFile", { path: "add.js", content: brokenAdd })] },
      { toolCalls: [toolCall("c2", "writeFile", { path: "add.test.js", content: testFile })] },
      { toolCalls: [toolCall("c3", "submit", {})] }, // real node --test FAILS here
      { toolCalls: [toolCall("c4", "writeFile", { path: "add.js", content: fixedAdd })] },
      { toolCalls: [toolCall("c5", "submit", {})] }, // and PASSES here
    ]);

    const result = await buildTask(
      {
        task: {
          taskId: "IT-1",
          description: "Implement add(a,b) in add.js",
          acceptanceCriteria: "node --test passes",
        },
        verifyCommand: "node --test add.test.js",
        caps: { ...DEFAULT_TASK_CAPS, commandTimeoutMs: 60_000 },
        costContext: { organizationId: "org-itest", runId: "run-itest" },
        organizationId: "org-itest",
        runId: "run-itest",
        taskRowId: "task-itest",
      },
      { sandbox, llm, db: fakeDb(sink), sandboxCostPerSec: 0.000042 },
    );

    expect(result.status).toBe("verified");
    expect(result.turns).toBe(5);
    // The first submit really failed inside the container.
    const submits = sink.envelopes.filter(
      (e): e is { kind: string; toolName: string; ok: boolean; exitCode?: number } =>
        typeof e === "object" && e !== null && (e as { toolName?: string }).toolName === "submit",
    );
    expect(submits).toHaveLength(2);
    expect(submits[0]?.ok).toBe(false);
    expect(submits[0]?.exitCode).not.toBe(0);
    expect(submits[1]?.ok).toBe(true);
    expect(sink.statuses).toEqual(["running", "verified"]);
  }, 120_000);
});
