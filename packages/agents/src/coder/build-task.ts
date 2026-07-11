import type {
  CompleteChatWithToolsArgs,
  CompleteChatWithToolsResult,
  CostContext,
  ToolChatMessage,
} from "@mullion/llm";
import { SandboxError, type Sandbox } from "@mullion/sandbox";
import type { Db } from "@mullion/db";
import type {
  ReadFileArgs,
  RunCommandArgs,
  TaskFailureReason,
  TaskResult,
  WriteFileArgs,
} from "@mullion/schemas";
import { checkBudget, type BudgetConfig } from "../budget.js";
import { withBackoff } from "../retry.js";
import { appendMessage, recordSandboxCost, setTaskStatus, type PersistContext } from "./persist.js";
import { buildCoderSystemPrompt, buildCoderUserMessage, type CoderTaskInput } from "./prompt.js";
import { CODER_TOOL_DEFINITIONS, parseToolCall } from "./tools.js";
import { inlineVerifier, type Verifier } from "./verify.js";

/**
 * The tool-loop runner (ADR-45/46) — a second agent-execution shape beside
 * the one-shot AgentSpec/runAgent, because an agentic loop doesn't fit a
 * pure buildMessages/parse contract.
 *
 * Invariants:
 * - "Verified" comes ONLY from the runner executing verifyCommand in the
 *   sandbox and observing exit 0 — the model can never grade itself.
 * - withBackoff wraps only the individual LLM transport call, never the
 *   loop — a tool-loop turn is not idempotent to replay.
 * - buildTask neither creates nor disposes the sandbox: lifecycle belongs
 *   to the caller (the M3 orchestrator later pools sandboxes).
 * - Every message persists as it happens; a crash leaves a complete
 *   transcript up to the last committed turn (no mid-loop resume — that's
 *   Temporal's job in M3).
 */

export interface TaskCaps {
  maxTurns: number;
  wallClockMs: number;
  /** Combined LLM + accrued-sandbox cost ceiling for this one task. */
  maxCostUsd: number;
  maxToolResultChars: number;
  /** Per-command timeout inside the sandbox. */
  commandTimeoutMs: number;
  /** M2: how many failed verify → fix rounds before the task fails. */
  maxTestFixCycles: number;
}

export const DEFAULT_TASK_CAPS: TaskCaps = {
  maxTurns: 16,
  wallClockMs: 8 * 60_000,
  maxCostUsd: 0.5,
  maxToolResultChars: 12_000,
  commandTimeoutMs: 60_000,
  maxTestFixCycles: 4,
};

export interface BuildTaskInput {
  task: CoderTaskInput;
  /** The machine gate the runner executes on submit — never model-supplied. */
  verifyCommand: string;
  caps: TaskCaps;
  costContext: CostContext;
  organizationId: string;
  runId: string;
  taskRowId: string;
  userId?: string | undefined;
}

/** Structural LLM dependency — scripted fakes in tests satisfy it too. */
export interface ToolCallingLlm {
  completeChatWithTools(args: CompleteChatWithToolsArgs): Promise<CompleteChatWithToolsResult>;
}

export interface BuildTaskDeps {
  sandbox: Sandbox;
  llm: ToolCallingLlm;
  db: Db;
  /** $/second modeling the sandbox provider rate (exercises the cost path on free local Docker). */
  sandboxCostPerSec: number;
  /** Verification strategy on submit. Defaults to M1's inline verifier. */
  verify?: Verifier | undefined;
  /** ADR-31 combined budget breaker; when set, checked before each LLM call and verify. */
  budget?: BudgetConfig | undefined;
  now?: () => number;
}

const MAX_CONSECUTIVE_INVALID = 3;
// Matches the envelope's toolCalls .max(16) — a turn emitting more is
// runaway (injection-induced fan-out) and bounded here, not just by TTL.
const MAX_TOOL_CALLS_PER_TURN = 16;
// Assistant prose is capped independently of tool-result truncation so the
// persisted envelope can never exceed agentMessageEnvelopeSchema's content
// bound (64KB) — otherwise a later read-validation would flag it corrupt.
const MAX_ASSISTANT_CONTENT_CHARS = 60_000;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return `${text.slice(0, half)}\n…[truncated ${text.length - maxChars} chars]…\n${text.slice(-half)}`;
}

export async function buildTask(input: BuildTaskInput, deps: BuildTaskDeps): Promise<TaskResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const ctx: PersistContext = {
    organizationId: input.organizationId,
    runId: input.runId,
    taskRowId: input.taskRowId,
  };
  const caps = input.caps;

  const verify = deps.verify ?? inlineVerifier;
  const writtenPaths = new Set<string>();

  let turns = 0;
  let llmCostUsd = 0;
  let consecutiveInvalid = 0;
  let nudged = false;
  let testFixCycles = 0;

  const sandboxCostSoFar = (): number => ((now() - started) / 1000) * deps.sandboxCostPerSec;
  const totalCost = (): number => llmCostUsd + sandboxCostSoFar();

  // ADR-31: returns "budget_exceeded" when the combined per-run/per-org
  // ceiling is hit, counting live sandbox accrual so a not-yet-persisted
  // best-effort cost can't slip the check.
  const budgetTripped = async (): Promise<TaskFailureReason | undefined> => {
    if (!deps.budget) return undefined;
    const status = await checkBudget(deps.db, {
      organizationId: input.organizationId,
      runId: input.runId,
      liveAccruedUsd: sandboxCostSoFar(),
      config: deps.budget,
    });
    return status.ok ? undefined : "budget_exceeded";
  };

  const finish = async (result: TaskResult): Promise<TaskResult> => {
    // Both writes are best-effort: buildTask's contract is to always resolve
    // to a TaskResult (ADR-46), never reject and leave the task row wedged in
    // 'running'. A DB blip here must not turn the result into a rejection.
    await setTaskStatus(
      deps.db,
      ctx,
      result.status === "verified" ? "verified" : "failed",
      result,
    ).catch(() => undefined);
    await recordSandboxCost(
      deps.db,
      { ...ctx, userId: input.userId },
      { durationMs: now() - started, costUsd: sandboxCostSoFar() },
    ).catch(() => undefined);
    return result;
  };
  const fail = (reason: TaskFailureReason, detail?: string): Promise<TaskResult> =>
    finish({
      status: "failed",
      reason,
      ...(detail !== undefined ? { detail: detail.slice(0, 2_000) } : {}),
      turns,
      costUsd: totalCost(),
      durationMs: now() - started,
    });

  const messages: ToolChatMessage[] = [
    { role: "system", content: buildCoderSystemPrompt() },
    { role: "user", content: buildCoderUserMessage(input.task) },
  ];

  const pushToolResult = async (
    toolCallId: string,
    toolName: string,
    ok: boolean,
    content: string,
    extra?: { exitCode?: number; durationMs?: number },
  ): Promise<void> => {
    const truncated = truncate(content, caps.maxToolResultChars);
    messages.push({ role: "tool", tool_call_id: toolCallId, content: truncated });
    await appendMessage(deps.db, ctx, {
      kind: "tool_result",
      toolCallId,
      toolName,
      ok,
      content: truncated,
      ...(extra?.exitCode !== undefined ? { exitCode: extra.exitCode } : {}),
      ...(extra?.durationMs !== undefined ? { durationMs: extra.durationMs } : {}),
    });
  };

  const capTripped = (): TaskFailureReason | undefined => {
    if (turns >= caps.maxTurns) return "turn_cap";
    if (now() - started >= caps.wallClockMs) return "time_cap";
    if (totalCost() >= caps.maxCostUsd) return "cost_cap";
    return undefined;
  };

  // Any unexpected throw (DB blip, driver bug) funnels to a "crashed"
  // TaskResult rather than rejecting — buildTask always resolves (ADR-46).
  try {
    await setTaskStatus(deps.db, ctx, "running");
    await appendMessage(deps.db, ctx, { kind: "system", content: messages[0]!.content as string });
    await appendMessage(deps.db, ctx, { kind: "user", content: messages[1]!.content as string });

    return await runLoop();
  } catch (error) {
    return fail("crashed", error instanceof Error ? error.message : String(error));
  }

  async function runLoop(): Promise<TaskResult> {
  for (;;) {
    // Caps gate every LLM call (the main unbounded spend in the loop).
    const preCall = capTripped();
    if (preCall) return fail(preCall, `cap tripped before turn ${turns + 1}`);
    const preBudget = await budgetTripped();
    if (preBudget) return fail(preBudget, `budget tripped before turn ${turns + 1}`);

    let completion: CompleteChatWithToolsResult;
    try {
      completion = await withBackoff(() =>
        deps.llm.completeChatWithTools({
          role: "coder",
          messages,
          tools: CODER_TOOL_DEFINITIONS,
          costContext: input.costContext,
        }),
      );
    } catch (error) {
      return fail("llm_error", error instanceof Error ? error.message : String(error));
    }

    turns += 1;
    llmCostUsd += completion.cost;

    // Keep the full content on the wire (the model needs its own context)
    // but persist a bounded copy so the envelope can't exceed its schema cap.
    const persistedContent =
      completion.content === null
        ? null
        : truncate(completion.content, MAX_ASSISTANT_CONTENT_CHARS);
    messages.push({
      role: "assistant",
      content: completion.content,
      ...(completion.toolCalls.length > 0 ? { tool_calls: completion.toolCalls } : {}),
    });
    await appendMessage(deps.db, ctx, {
      kind: "assistant",
      content: persistedContent,
      toolCalls: completion.toolCalls.map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      })),
      generationId: completion.generationId,
      costUsd: completion.cost,
    });

    // A turn emitting more calls than the transcript can hold is runaway.
    if (completion.toolCalls.length > MAX_TOOL_CALLS_PER_TURN) {
      return fail("protocol", `turn emitted ${completion.toolCalls.length} tool calls (max ${MAX_TOOL_CALLS_PER_TURN})`);
    }

    if (completion.toolCalls.length === 0) {
      if (nudged) {
        return fail("protocol", "model produced two consecutive turns with no tool calls");
      }
      nudged = true;
      const nudge =
        "You must respond with a tool call. Use writeFile/readFile/runCommand to work, or submit when done.";
      messages.push({ role: "user", content: nudge });
      await appendMessage(deps.db, ctx, { kind: "user", content: nudge });
      continue;
    }
    nudged = false;

    for (const call of completion.toolCalls) {
      // Re-check caps between individual calls: one turn can carry many
      // runCommands, each accruing real time/cost before the next LLM round.
      const midBatch = capTripped();
      if (midBatch) return fail(midBatch, `cap tripped mid-turn ${turns}`);

      const parsed = parseToolCall(call.function.name, call.function.arguments);

      if (!parsed.ok) {
        consecutiveInvalid += 1;
        await pushToolResult(call.id, call.function.name, false, `error: ${parsed.error}`);
        if (consecutiveInvalid >= MAX_CONSECUTIVE_INVALID) {
          return fail("protocol", `${MAX_CONSECUTIVE_INVALID} consecutive invalid tool calls`);
        }
        continue;
      }
      consecutiveInvalid = 0;

      try {
        switch (parsed.name) {
          case "writeFile": {
            const args = parsed.args as WriteFileArgs;
            await deps.sandbox.writeFile(args.path, args.content);
            writtenPaths.add(args.path);
            await pushToolResult(call.id, parsed.name, true, `wrote ${args.path} (${args.content.length} bytes)`);
            break;
          }
          case "readFile": {
            const args = parsed.args as ReadFileArgs;
            const content = await deps.sandbox.readFile(args.path);
            await pushToolResult(call.id, parsed.name, true, content);
            break;
          }
          case "runCommand": {
            const args = parsed.args as RunCommandArgs;
            const result = await deps.sandbox.runCommand(args.cmd, {
              timeoutMs: caps.commandTimeoutMs,
            });
            await pushToolResult(
              call.id,
              parsed.name,
              result.exitCode === 0,
              `exit ${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
              { exitCode: result.exitCode, durationMs: result.durationMs },
            );
            break;
          }
          case "submit": {
            // The runner owns verification (ADR-46/48) — the model requests
            // it, the injected verifier decides pass/fail from an exit code
            // the model cannot fake.
            const preVerifyBudget = await budgetTripped();
            if (preVerifyBudget) return fail(preVerifyBudget, "budget tripped before verification");

            const outcome = await verify({
              buildSandbox: deps.sandbox,
              writtenPaths,
              verifyCommand: input.verifyCommand,
              commandTimeoutMs: caps.commandTimeoutMs,
              costContext: input.costContext,
            });
            llmCostUsd += outcome.costUsd; // Tester-agent cost counts toward the task

            // The Tester's structured verdict joins the durable transcript.
            if (outcome.report) {
              await appendMessage(deps.db, ctx, {
                kind: "test_report",
                passed: outcome.passed,
                exitCode: outcome.exitCode,
                failures: outcome.report.failures,
                summary: outcome.report.summary,
                costUsd: outcome.costUsd,
              });
            }

            if (outcome.passed) {
              await pushToolResult(call.id, parsed.name, true, "verification passed", {
                exitCode: outcome.exitCode,
              });
              return finish({
                status: "verified",
                turns,
                costUsd: totalCost(),
                durationMs: now() - started,
              });
            }

            testFixCycles += 1;
            if (testFixCycles >= caps.maxTestFixCycles) {
              await pushToolResult(call.id, parsed.name, false, outcome.feedback, {
                exitCode: outcome.exitCode,
              });
              return fail("test_failed", `${caps.maxTestFixCycles} verify/fix cycles exhausted`);
            }
            await pushToolResult(
              call.id,
              parsed.name,
              false,
              `verification failed (exit ${outcome.exitCode})\n${outcome.feedback}`,
              { exitCode: outcome.exitCode },
            );
            break;
          }
        }
      } catch (error) {
        if (error instanceof SandboxError) {
          if (error.kind === "container_died" || error.kind === "driver_unavailable") {
            return fail("sandbox_died", error.message);
          }
          // timeout / not_found / protocol are signal the model should see.
          await pushToolResult(call.id, parsed.name, false, `error: ${error.message}`);
          continue;
        }
        throw error;
      }
    }
  }
  }
}
