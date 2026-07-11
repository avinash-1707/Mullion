import type { CompleteChatArgs, CompleteChatResult } from "@mullion/llm";
import { MalformedLlmResponseError } from "@mullion/llm";
import type { SandboxDriver } from "@mullion/sandbox";
import type { Db } from "@mullion/db";
import { withBackoff } from "../retry.js";
import { recordSandboxCost } from "../coder/persist.js";
import type { Verifier } from "../coder/verify.js";
import { testerAgent } from "./tester.js";

/**
 * M2's verifier (ADR-48). Runs each check in a FRESH sandbox — not the
 * Coder's build sandbox — and writes the runner-owned test files LAST, so
 * the Coder cannot REPLACE the tests that grade it (the file-level
 * guarantee that closes ADR-46's self-grading gap; proven by the
 * integration test).
 *
 * Known residual (NOT closed by M2 — see ADR-48): the runner test still
 * `require`s the Coder's source into the grading process, so adversarial
 * Coder code could subvert its own in-process test run (monkeypatch
 * node:assert, force process.exit(0)). Defeating that needs out-of-process
 * / black-box grading, deferred. And only files the Coder wrote via
 * `writeFile` are copied — the Coder must writeFile every graded artifact.
 *
 * Pass/fail is ALWAYS the deterministic exit code. The Tester LLM only
 * summarizes failures; a parse/LLM failure must never discard a decided
 * verdict, so it degrades to an empty report.
 */

/** Structural LLM dep — the real OpenRouterClient and test fakes both satisfy it. */
export interface OneShotLlm {
  completeChat(args: CompleteChatArgs): Promise<CompleteChatResult>;
}

export interface TesterVerifierConfig {
  driver: SandboxDriver;
  llm: OneShotLlm;
  /** Runner-owned test files, written into the fresh sandbox after the Coder's sources. */
  runnerTests: { path: string; content: string }[];
  /** Command that runs the runner-owned tests in the fresh sandbox. */
  testCommand: string;
  image?: string | undefined;
  /** TTL for the fresh verification sandbox. */
  sandboxTimeoutMs: number;
  /** For attributing the fresh sandbox's own compute to cost_events (ADR-49). */
  db: Db;
  sandboxCostPerSec: number;
}

export function makeTesterVerifier(config: TesterVerifierConfig): Verifier {
  return async (ctx) => {
    const startedAt = Date.now();
    const sandbox = await config.driver.create({
      ...(config.image !== undefined ? { image: config.image } : {}),
      timeoutMs: config.sandboxTimeoutMs,
      ...(ctx.costContext.runId !== undefined ? { runId: ctx.costContext.runId } : {}),
    });
    try {
      // Copy the Coder's produced sources into the clean sandbox. Only
      // writeFile-tracked paths (documented constraint, ADR-48).
      for (const path of ctx.writtenPaths) {
        const content = await ctx.buildSandbox.readFile(path).catch(() => undefined);
        if (content !== undefined) await sandbox.writeFile(path, content);
      }
      // Runner-owned tests written LAST → they overwrite any file the Coder
      // named the same, so a `add.test.js` the Coder faked can't take.
      for (const test of config.runnerTests) {
        await sandbox.writeFile(test.path, test.content);
      }

      const result = await sandbox.runCommand(config.testCommand, {
        timeoutMs: ctx.commandTimeoutMs,
      });
      const passed = result.exitCode === 0; // authoritative, LLM-independent

      // The Tester agent only summarizes failures. Its failure (bad JSON,
      // LLM error) must NOT discard the already-decided verdict — degrade to
      // an empty report so a flaky cosmetic parse can't fail a green build.
      let report = { failures: [] as string[], summary: "" };
      let testerCostUsd = 0;
      try {
        const parsed = await withBackoff(async () => {
          const completion = await config.llm.completeChat({
            role: "tester",
            messages: testerAgent.buildMessages({
              command: config.testCommand,
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr,
            }),
            costContext: ctx.costContext,
          });
          return { report: testerAgent.parse(completion.content), costUsd: completion.cost };
        });
        report = parsed.report;
        testerCostUsd = parsed.costUsd;
      } catch (error) {
        if (!(error instanceof MalformedLlmResponseError) && !isLlmError(error)) throw error;
        // Fall back to raw output tails so the Coder still gets a signal.
        report = {
          failures: [],
          summary: `test summary unavailable (tester parse failed); exit ${result.exitCode}. ${result.stderr.slice(-1_000) || result.stdout.slice(-1_000)}`,
        };
      }

      const sandboxCostUsd = ((Date.now() - startedAt) / 1000) * config.sandboxCostPerSec;
      // Persist the fresh sandbox's own compute so the per-run/per-org
      // breaker (ADR-49) counts it — otherwise every fix cycle spins an
      // uncounted billed sandbox. Needs a runId to attribute against.
      if (ctx.costContext.runId !== undefined) {
        await recordSandboxCost(
          config.db,
          {
            organizationId: ctx.costContext.organizationId,
            runId: ctx.costContext.runId,
            taskRowId: "",
            ...(ctx.costContext.userId !== undefined ? { userId: ctx.costContext.userId } : {}),
          },
          { durationMs: Date.now() - startedAt, costUsd: sandboxCostUsd },
        ).catch(() => undefined);
      }

      const feedback = report.failures.length > 0 ? report.failures.join("\n") : report.summary;
      return {
        passed,
        exitCode: result.exitCode,
        feedback,
        costUsd: testerCostUsd + sandboxCostUsd,
        report,
      };
    } finally {
      // Best-effort: a dispose hiccup must never turn a passing verify into
      // a thrown SandboxError that fails the task.
      await sandbox.dispose().catch(() => undefined);
    }
  };
}

function isLlmError(error: unknown): boolean {
  // OpenRouterError and friends carry a `retryable` flag; treat any such
  // typed LLM transport error as "summary unavailable", not a task crash.
  return typeof error === "object" && error !== null && "retryable" in error;
}
