import { describe, expect, it } from "vitest";
import type { Db } from "@mullion/db";
import { FakeSandbox } from "@mullion/sandbox/testing";
import { SandboxError } from "@mullion/sandbox";
import { agentMessageEnvelopeSchema, type AgentMessageEnvelope } from "@mullion/schemas";
import { OpenRouterError } from "@mullion/llm";
import { DEFAULT_TASK_CAPS, buildTask, type BuildTaskInput, type TaskCaps } from "./build-task.js";
import { ScriptedLlm, toolCall } from "./__fixtures__/scripted-llm.js";

/**
 * The loop is tested against FakeSandbox + scripted adversarial LLM
 * transcripts — the real-substrate proof lives in the harness integration
 * test (real Docker + scripted LLM). No live LLM anywhere
 * (CODING_STANDARDS §6).
 */

interface Recorded {
  messages: AgentMessageEnvelope[];
  taskStatuses: Array<{ status: string; result?: unknown }>;
  costEvents: unknown[];
}

function fakeDb(recorded: Recorded): Db {
  return {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if ("envelope" in values) {
          // Validate on write, like the real boundary would.
          recorded.messages.push(agentMessageEnvelopeSchema.parse(values["envelope"]));
        } else {
          recorded.costEvents.push(values);
        }
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
  } as unknown as Db;
}

const caps: TaskCaps = { ...DEFAULT_TASK_CAPS, maxTurns: 6, commandTimeoutMs: 5_000 };

function input(overrides?: Partial<BuildTaskInput>): BuildTaskInput {
  return {
    task: {
      taskId: "T1",
      description: "Write add.js exporting add(a,b)",
      acceptanceCriteria: "node verify.js exits 0",
    },
    verifyCommand: "node verify.js",
    caps,
    costContext: { organizationId: "org-1", runId: "run-1" },
    organizationId: "org-1",
    runId: "run-1",
    taskRowId: "task-row-1",
    ...overrides,
  };
}

function okSandbox(verifyExit = 0): FakeSandbox {
  return new FakeSandbox((cmd) => ({
    stdout: cmd === "node verify.js" ? "" : "ran",
    stderr: "",
    exitCode: cmd === "node verify.js" ? verifyExit : 0,
    durationMs: 5,
  }));
}

describe("buildTask", () => {
  it("happy path: write → run → submit → verified by the runner, not the model", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const sandbox = okSandbox(0);
    const llm = new ScriptedLlm([
      { toolCalls: [toolCall("c1", "writeFile", { path: "add.js", content: "exports.add=(a,b)=>a+b" })] },
      { toolCalls: [toolCall("c2", "runCommand", { cmd: "node -e 1" })] },
      { toolCalls: [toolCall("c3", "submit", {})] },
    ]);

    const result = await buildTask(input(), {
      sandbox,
      llm,
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });

    expect(result.status).toBe("verified");
    expect(result.turns).toBe(3);
    // The runner executed the verify command inside the sandbox.
    expect(sandbox.commands).toContain("node verify.js");
    // Statuses: running → verified with a TaskResult attached.
    expect(recorded.taskStatuses.map((s) => s.status)).toEqual(["running", "verified"]);
    // Sandbox cost captured (source field checked at the type boundary).
    expect(recorded.costEvents).toHaveLength(1);
    expect(recorded.costEvents[0]).toMatchObject({ source: "sandbox", runId: "run-1" });
    // Transcript persisted: system, user, 3 assistants, 3 tool results.
    expect(recorded.messages.filter((m) => m.kind === "assistant")).toHaveLength(3);
    expect(recorded.messages.filter((m) => m.kind === "tool_result")).toHaveLength(3);
  });

  it("recovered failure: failing verify output is fed back, then a fix converges", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    let verifyCalls = 0;
    const sandbox = new FakeSandbox((cmd) => {
      if (cmd === "node verify.js") {
        verifyCalls += 1;
        return {
          stdout: "",
          stderr: verifyCalls === 1 ? "AssertionError: expected 2" : "",
          exitCode: verifyCalls === 1 ? 1 : 0,
          durationMs: 5,
        };
      }
      return { stdout: "", stderr: "", exitCode: 0, durationMs: 5 };
    });
    const llm = new ScriptedLlm([
      { toolCalls: [toolCall("c1", "writeFile", { path: "add.js", content: "bad" })] },
      { toolCalls: [toolCall("c2", "submit", {})] },
      { toolCalls: [toolCall("c3", "writeFile", { path: "add.js", content: "good" })] },
      { toolCalls: [toolCall("c4", "submit", {})] },
    ]);

    const result = await buildTask(input(), {
      sandbox,
      llm,
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });

    expect(result.status).toBe("verified");
    expect(verifyCalls).toBe(2);
    const failedVerify = recorded.messages.find(
      (m) => m.kind === "tool_result" && m.ok === false && m.toolName === "submit",
    );
    expect(failedVerify && "content" in failedVerify && failedVerify.content).toContain(
      "AssertionError",
    );
  });

  it("turn cap trips when the model never submits", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const turns = Array.from({ length: 10 }, (_, i) => ({
      toolCalls: [toolCall(`c${i}`, "runCommand", { cmd: "true" })],
    }));
    const result = await buildTask(input(), {
      sandbox: okSandbox(),
      llm: new ScriptedLlm(turns),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result).toMatchObject({ status: "failed", reason: "turn_cap", turns: 6 });
  });

  it("cost cap trips on accumulated LLM cost", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const turns = Array.from({ length: 10 }, (_, i) => ({
      toolCalls: [toolCall(`c${i}`, "runCommand", { cmd: "true" })],
      cost: 0.3,
    }));
    const result = await buildTask(input(), {
      sandbox: okSandbox(),
      llm: new ScriptedLlm(turns),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result).toMatchObject({ status: "failed", reason: "cost_cap" });
    expect(result.turns).toBe(2); // 0.6 accumulated after two turns ≥ 0.5 cap
  });

  it("time cap trips via the injected clock", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    let clock = 0;
    const result = await buildTask(input(), {
      sandbox: okSandbox(),
      llm: new ScriptedLlm([
        { toolCalls: [toolCall("c1", "runCommand", { cmd: "true" })] },
        { toolCalls: [toolCall("c2", "runCommand", { cmd: "true" })] },
      ]),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
      now: () => {
        clock += 3 * 60_000; // every observation advances 3 minutes
        return clock;
      },
    });
    expect(result).toMatchObject({ status: "failed", reason: "time_cap" });
  });

  it("malformed tool call is fed back as an error and the model can recover", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const llm = new ScriptedLlm([
      { toolCalls: [toolCall("c1", "writeFile", "{not json")] },
      { toolCalls: [toolCall("c2", "writeFile", { path: "a.js", content: "ok" })] },
      { toolCalls: [toolCall("c3", "submit", {})] },
    ]);
    const result = await buildTask(input(), {
      sandbox: okSandbox(0),
      llm,
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result.status).toBe("verified");
    const errorResult = recorded.messages.find((m) => m.kind === "tool_result" && !m.ok);
    expect(errorResult && "content" in errorResult && errorResult.content).toContain(
      "not valid JSON",
    );
  });

  it("three consecutive invalid tool calls end in protocol failure", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const llm = new ScriptedLlm([
      { toolCalls: [toolCall("c1", "unknownTool", {})] },
      { toolCalls: [toolCall("c2", "writeFile", "{bad")] },
      { toolCalls: [toolCall("c3", "readFile", {})] }, // missing required path
    ]);
    const result = await buildTask(input(), {
      sandbox: okSandbox(),
      llm,
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result).toMatchObject({ status: "failed", reason: "protocol" });
  });

  it("no tool calls → one nudge → second offense fails as protocol", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const llm = new ScriptedLlm([{ content: "I think I'm done!" }, { content: "All finished." }]);
    const result = await buildTask(input(), {
      sandbox: okSandbox(),
      llm,
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result).toMatchObject({ status: "failed", reason: "protocol" });
    expect(llm.requests).toHaveLength(2); // nudge produced exactly one extra ask
  });

  it("sandbox death is terminal as sandbox_died", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const sandbox = new FakeSandbox(() => {
      throw new SandboxError({ kind: "container_died", message: "OOM", retryable: true });
    });
    const result = await buildTask(input(), {
      sandbox,
      llm: new ScriptedLlm([{ toolCalls: [toolCall("c1", "runCommand", { cmd: "true" })] }]),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result).toMatchObject({ status: "failed", reason: "sandbox_died" });
    expect(recorded.taskStatuses.at(-1)).toMatchObject({ status: "failed" });
  });

  it("command timeout is signal, not death — the loop continues", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    let calls = 0;
    const sandbox = new FakeSandbox((cmd) => {
      calls += 1;
      if (calls === 1) {
        throw new SandboxError({ kind: "timeout", message: "command exceeded 5000ms", retryable: false });
      }
      return { stdout: "", stderr: "", exitCode: 0, durationMs: 5 };
    });
    const result = await buildTask(input(), {
      sandbox,
      llm: new ScriptedLlm([
        { toolCalls: [toolCall("c1", "runCommand", { cmd: "sleep 999" })] },
        { toolCalls: [toolCall("c2", "submit", {})] },
      ]),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result.status).toBe("verified");
    const timeoutMsg = recorded.messages.find((m) => m.kind === "tool_result" && !m.ok);
    expect(timeoutMsg && "content" in timeoutMsg && timeoutMsg.content).toContain("exceeded");
  });

  it("cost cap counts sandbox-accrued cost, not just LLM cost", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    let clock = 0;
    const result = await buildTask(input(), {
      sandbox: okSandbox(),
      // Zero LLM cost — the cap must trip on sandbox time alone (ADR-28 combined figure).
      llm: new ScriptedLlm(
        Array.from({ length: 10 }, (_, i) => ({
          toolCalls: [toolCall(`c${i}`, "runCommand", { cmd: "true" })],
          cost: 0,
        })),
      ),
      db: fakeDb(recorded),
      sandboxCostPerSec: 1, // $1/s
      now: () => {
        clock += 200; // +0.2s per observation, well under the 8min wall-clock
        return clock;
      },
    });
    expect(result).toMatchObject({ status: "failed", reason: "cost_cap" });
  });

  it("readFile not_found is fed back and the loop continues", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const result = await buildTask(input(), {
      sandbox: okSandbox(0),
      llm: new ScriptedLlm([
        { toolCalls: [toolCall("c1", "readFile", { path: "nope.txt" })] },
        { toolCalls: [toolCall("c2", "submit", {})] },
      ]),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result.status).toBe("verified");
    const err = recorded.messages.find((m) => m.kind === "tool_result" && !m.ok);
    expect(err && "content" in err && err.content).toContain("no such file");
  });

  it("path-escape protocol error from the sandbox is fed back, not fatal", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const result = await buildTask(input(), {
      sandbox: okSandbox(0),
      llm: new ScriptedLlm([
        { toolCalls: [toolCall("c1", "writeFile", { path: "../escape.txt", content: "x" })] },
        { toolCalls: [toolCall("c2", "submit", {})] },
      ]),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result.status).toBe("verified"); // protocol error is signal, not death
    const err = recorded.messages.find((m) => m.kind === "tool_result" && !m.ok);
    expect(err && "content" in err && err.content).toContain("escapes sandbox workdir");
  });

  it("driver_unavailable is terminal as sandbox_died", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const sandbox = new FakeSandbox(() => {
      throw new SandboxError({ kind: "driver_unavailable", message: "daemon gone", retryable: true });
    });
    const result = await buildTask(input(), {
      sandbox,
      llm: new ScriptedLlm([{ toolCalls: [toolCall("c1", "runCommand", { cmd: "true" })] }]),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result).toMatchObject({ status: "failed", reason: "sandbox_died" });
  });

  it("nudge resets after recovery — an empty turn later does not carry the earlier nudge", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const result = await buildTask(input(), {
      sandbox: okSandbox(0),
      llm: new ScriptedLlm([
        { content: "thinking..." }, // empty → nudge
        { toolCalls: [toolCall("c1", "writeFile", { path: "a.js", content: "ok" })] }, // recover (resets)
        { content: "hmm..." }, // empty again → nudge, NOT protocol failure
        { toolCalls: [toolCall("c2", "submit", {})] },
      ]),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result.status).toBe("verified");
  });

  it("executes multiple tool calls in one assistant turn, one result each in order", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const result = await buildTask(input(), {
      sandbox: okSandbox(0),
      llm: new ScriptedLlm([
        {
          toolCalls: [
            toolCall("c1", "writeFile", { path: "a.js", content: "1" }),
            toolCall("c2", "writeFile", { path: "b.js", content: "2" }),
          ],
        },
        { toolCalls: [toolCall("c3", "submit", {})] },
      ]),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result.status).toBe("verified");
    const toolResults = recorded.messages.filter((m) => m.kind === "tool_result");
    const writeResults = toolResults.filter(
      (m): m is Extract<AgentMessageEnvelope, { kind: "tool_result" }> =>
        m.kind === "tool_result" && m.toolName === "writeFile",
    );
    expect(writeResults.map((m) => m.toolCallId)).toEqual(["c1", "c2"]);
  });

  it("fails protocol when a single turn emits more than the tool-call cap", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const manyCalls = Array.from({ length: 17 }, (_, i) => toolCall(`c${i}`, "runCommand", { cmd: "true" }));
    const result = await buildTask(input(), {
      sandbox: okSandbox(),
      llm: new ScriptedLlm([{ toolCalls: manyCalls }]),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result).toMatchObject({ status: "failed", reason: "protocol" });
  });

  it("recovers when a transient LLM error clears within the backoff budget", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const llm = new ScriptedLlm([
      {
        // Throws twice (retryable), then resolves on the 3rd attempt.
        error: new OpenRouterError({ message: "502", status: 502, retryable: true }),
        throwTimes: 2,
        toolCalls: [toolCall("c1", "submit", {})],
      },
    ]);
    const result = await buildTask(input(), {
      sandbox: okSandbox(0),
      llm,
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result.status).toBe("verified");
  });

  it("always resolves to a TaskResult even when a DB write throws (crashed)", async () => {
    // A db whose message insert rejects — buildTask must not reject.
    const throwingDb = {
      insert: () => ({ values: () => Promise.reject(new Error("neon blip")) }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    } as unknown as Db;
    const result = await buildTask(input(), {
      sandbox: okSandbox(),
      llm: new ScriptedLlm([{ toolCalls: [toolCall("c1", "submit", {})] }]),
      db: throwingDb,
      sandboxCostPerSec: 0.0001,
    });
    expect(result).toMatchObject({ status: "failed", reason: "crashed" });
  });

  it("non-retryable LLM error fails as llm_error", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const result = await buildTask(input(), {
      sandbox: okSandbox(),
      llm: new ScriptedLlm([
        { error: new OpenRouterError({ message: "bad request", status: 400, retryable: false }) },
      ]),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result).toMatchObject({ status: "failed", reason: "llm_error" });
  });

  it("tool results are truncated to the cap before persist and feedback", async () => {
    const recorded: Recorded = { messages: [], taskStatuses: [], costEvents: [] };
    const bigOutput = "x".repeat(100_000);
    const sandbox = new FakeSandbox((cmd) =>
      cmd === "node verify.js"
        ? { stdout: "", stderr: "", exitCode: 0, durationMs: 5 }
        : { stdout: bigOutput, stderr: "", exitCode: 0, durationMs: 5 },
    );
    const result = await buildTask(input(), {
      sandbox,
      llm: new ScriptedLlm([
        { toolCalls: [toolCall("c1", "runCommand", { cmd: "cat big" })] },
        { toolCalls: [toolCall("c2", "submit", {})] },
      ]),
      db: fakeDb(recorded),
      sandboxCostPerSec: 0.0001,
    });
    expect(result.status).toBe("verified");
    const runResult = recorded.messages.find(
      (m): m is Extract<AgentMessageEnvelope, { kind: "tool_result" }> =>
        m.kind === "tool_result" && m.toolName === "runCommand",
    );
    expect(runResult?.content.length).toBeLessThan(13_000);
    expect(runResult?.content).toContain("[truncated");
  });
});
