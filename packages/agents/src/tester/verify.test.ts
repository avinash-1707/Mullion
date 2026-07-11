import { describe, expect, it, vi } from "vitest";
import type { CompleteChatArgs, CompleteChatResult } from "@mullion/llm";
import { FakeSandbox } from "@mullion/sandbox/testing";
import {
  SandboxError,
  type CommandResult,
  type RunCommandOptions,
  type Sandbox,
  type SandboxDriver,
} from "@mullion/sandbox";
import type { Db } from "@mullion/db";
import { makeTesterVerifier, type OneShotLlm } from "./verify.js";

/** Captures inserted sandbox cost_events so tests can assert attribution. */
function noopDb(costRows: unknown[] = []): Db {
  return {
    insert: () => ({
      values: (v: unknown) => {
        costRows.push(v);
        return Promise.resolve();
      },
    }),
  } as unknown as Db;
}

function fakeLlm(report: { summary: string; failures: string[] }, cost = 0.002): OneShotLlm {
  return {
    completeChat: vi.fn(
      async (_args: CompleteChatArgs): Promise<CompleteChatResult> => ({
        content: JSON.stringify(report),
        model: "test/tester",
        generationId: "gen-t",
        cost,
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
      }),
    ),
  };
}

/** Driver whose fresh sandbox runs runner-owned tests via the given handler. */
function fakeDriver(
  onRun: (cmd: string, files: Map<string, string>) => CommandResult,
): { driver: SandboxDriver; created: FakeSandbox[] } {
  const created: FakeSandbox[] = [];
  const driver: SandboxDriver = {
    name: "local",
    create: async (): Promise<Sandbox> => {
      // Handler reads the sandbox's OWN files map (populated by writeFile).
      const sandbox = new FakeSandbox((cmd: string, _opts: RunCommandOptions) =>
        onRun(cmd, sandbox.files),
      );
      created.push(sandbox);
      return sandbox;
    },
  };
  return { driver, created };
}

const ctx = {
  writtenPaths: new Set(["add.js"]),
  verifyCommand: "node --test",
  commandTimeoutMs: 5_000,
  costContext: { organizationId: "org-1", runId: "run-1" },
};

describe("makeTesterVerifier", () => {
  it("runs runner-owned tests in a FRESH sandbox and returns exit-code pass/fail", async () => {
    const build = new FakeSandbox();
    await build.writeFile("add.js", "exports.add=(a,b)=>a+b");
    const { driver, created } = fakeDriver(() => ({ stdout: "ok", stderr: "", exitCode: 0, durationMs: 3 }));
    const verify = makeTesterVerifier({
      driver,
      llm: fakeLlm({ summary: "all green", failures: [] }),
      runnerTests: [{ path: "add.test.js", content: "runner-owned test" }],
      testCommand: "node --test",
      sandboxTimeoutMs: 60_000,
      db: noopDb(),
      sandboxCostPerSec: 0.0001,
    });

    const result = await verify({ ...ctx, buildSandbox: build });
    expect(result.passed).toBe(true);
    // Tester LLM cost (0.002) plus the fresh sandbox's own compute (ADR-49).
    expect(result.costUsd).toBeGreaterThanOrEqual(0.002);
    // Fresh sandbox got the Coder source AND the runner test, and was disposed.
    const fresh = created[0]!;
    expect(fresh.files.get("/workspace/add.js")).toBe("exports.add=(a,b)=>a+b");
    expect(fresh.files.get("/workspace/add.test.js")).toBe("runner-owned test");
    expect(fresh.disposed).toBe(true);
  });

  it("runner-owned tests overwrite a Coder file of the same name (cheat cannot take)", async () => {
    const build = new FakeSandbox();
    // The Coder tries to plant its own passing test.
    await build.writeFile("add.test.js", "test('x',()=>{}) // fake, always passes");
    const { driver, created } = fakeDriver((_cmd, files) => {
      // The verdict depends on which test file is present in the FRESH sandbox.
      const test = files.get("/workspace/add.test.js");
      return test === "REAL runner test"
        ? { stdout: "", stderr: "assert failed", exitCode: 1, durationMs: 3 }
        : { stdout: "ok", stderr: "", exitCode: 0, durationMs: 3 };
    });
    const verify = makeTesterVerifier({
      driver,
      llm: fakeLlm({ summary: "1 failed", failures: ["add: expected 4 got NaN"] }),
      runnerTests: [{ path: "add.test.js", content: "REAL runner test" }],
      testCommand: "node --test",
      sandboxTimeoutMs: 60_000,
      db: noopDb(),
      sandboxCostPerSec: 0.0001,
    });

    const result = await verify({
      ...ctx,
      writtenPaths: new Set(["add.test.js"]),
      buildSandbox: build,
    });
    // The Coder's planted test was overwritten by the runner's → real test ran → failed.
    expect(created[0]!.files.get("/workspace/add.test.js")).toBe("REAL runner test");
    expect(result.passed).toBe(false);
    expect(result.feedback).toContain("expected 4");
  });

  it("surfaces parsed failures as feedback on a failing run", async () => {
    const build = new FakeSandbox();
    const { driver } = fakeDriver(() => ({ stdout: "", stderr: "boom", exitCode: 1, durationMs: 3 }));
    const verify = makeTesterVerifier({
      driver,
      llm: fakeLlm({ summary: "failed", failures: ["testA broke", "testB broke"] }),
      runnerTests: [{ path: "t.test.js", content: "x" }],
      testCommand: "node --test",
      sandboxTimeoutMs: 60_000,
      db: noopDb(),
      sandboxCostPerSec: 0.0001,
    });
    const result = await verify({ ...ctx, buildSandbox: build });
    expect(result.passed).toBe(false);
    expect(result.feedback).toBe("testA broke\ntestB broke");
    expect(result.report?.failures).toHaveLength(2);
  });

  it("a malformed Tester response does NOT discard a passing exit code", async () => {
    const build = new FakeSandbox();
    const { driver } = fakeDriver(() => ({ stdout: "ok", stderr: "", exitCode: 0, durationMs: 3 }));
    const brokenLlm: OneShotLlm = {
      completeChat: vi.fn(async () => ({
        content: "not json at all",
        model: "t",
        generationId: "g",
        cost: 0.001,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      })),
    };
    const verify = makeTesterVerifier({
      driver,
      llm: brokenLlm,
      runnerTests: [{ path: "t.test.js", content: "x" }],
      testCommand: "node --test",
      sandboxTimeoutMs: 60_000,
      db: noopDb(),
      sandboxCostPerSec: 0.0001,
    });
    const result = await verify({ ...ctx, buildSandbox: build });
    // Exit 0 stands; the report degrades to a summary rather than throwing.
    expect(result.passed).toBe(true);
    expect(result.report?.failures).toEqual([]);
    expect(result.feedback).toContain("unavailable");
  });

  it("records the fresh sandbox's compute to cost_events (ADR-49)", async () => {
    const build = new FakeSandbox();
    const costRows: unknown[] = [];
    const { driver } = fakeDriver(() => ({ stdout: "", stderr: "", exitCode: 0, durationMs: 3 }));
    const verify = makeTesterVerifier({
      driver,
      llm: fakeLlm({ summary: "ok", failures: [] }),
      runnerTests: [{ path: "t.test.js", content: "x" }],
      testCommand: "node --test",
      sandboxTimeoutMs: 60_000,
      db: noopDb(costRows),
      sandboxCostPerSec: 0.0001,
    });
    await verify({ ...ctx, buildSandbox: build });
    expect(costRows).toHaveLength(1);
    expect(costRows[0]).toMatchObject({ source: "sandbox", runId: "run-1" });
  });

  it("skips a written path that can no longer be read, without throwing", async () => {
    const build = new FakeSandbox();
    // "gone.js" is in writtenPaths but never written → readFile rejects.
    await build.writeFile("kept.js", "keep");
    const seen: string[] = [];
    const { driver } = fakeDriver((cmd, files) => {
      seen.push(...files.keys());
      return { stdout: "", stderr: "", exitCode: 0, durationMs: 3 };
    });
    const verify = makeTesterVerifier({
      driver,
      llm: fakeLlm({ summary: "ok", failures: [] }),
      runnerTests: [{ path: "t.test.js", content: "x" }],
      testCommand: "node --test",
      sandboxTimeoutMs: 60_000,
      db: noopDb(),
      sandboxCostPerSec: 0.0001,
    });
    const result = await verify({
      ...ctx,
      writtenPaths: new Set(["kept.js", "gone.js"]),
      buildSandbox: build,
    });
    expect(result.passed).toBe(true);
    expect(seen).toContain("/workspace/kept.js");
    expect(seen).not.toContain("/workspace/gone.js");
  });

  it("disposes the fresh sandbox even when the test command throws", async () => {
    const build = new FakeSandbox();
    const { driver, created } = fakeDriver(() => {
      throw new SandboxError({ kind: "container_died", message: "boom", retryable: true });
    });
    const verify = makeTesterVerifier({
      driver,
      llm: fakeLlm({ summary: "x", failures: [] }),
      runnerTests: [{ path: "t.test.js", content: "x" }],
      testCommand: "node --test",
      sandboxTimeoutMs: 60_000,
      db: noopDb(),
      sandboxCostPerSec: 0.0001,
    });
    await expect(verify({ ...ctx, buildSandbox: build })).rejects.toBeInstanceOf(SandboxError);
    expect(created[0]!.disposed).toBe(true);
  });
});
