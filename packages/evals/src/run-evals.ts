/**
 * Eval suite runner (ADR-12/60). Usage, from packages/evals:
 *
 *   pnpm evals                       # scripted mode against local Postgres+Docker
 *   pnpm evals -- --mode live        # real OpenRouter (needs OPENROUTER_API_KEY)
 *   pnpm evals -- --mode replay      # cassettes recorded earlier (ADR-11)
 *   pnpm evals -- --only e07         # subset while iterating (not recorded)
 *
 * Appends one EvalRunRecord per full run to docs/evals/history.jsonl — the
 * trend line's source of truth. Partial (--only) runs never record: a trend
 * over shifting subsets is noise wearing a chart's clothes.
 *
 * Exit code: non-zero when the harness itself misbehaves — in scripted mode
 * any task whose outcome differs from the fixture's `expected`, in any mode
 * an infrastructure crash. Live pass-rate dips are DATA (the chart's job),
 * not harness failures.
 */
import { execSync } from "node:child_process";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createDb } from "@mullion/db";
import {
  OpenRouterClient,
  createRecordReplayFetch,
  seedModelRouting,
} from "@mullion/llm";
import { ScriptedLlm } from "@mullion/agents/testing";
import type { OneShotLlm, ToolCallingLlm } from "@mullion/agents";
import { createSandboxDriver } from "@mullion/sandbox";
import { EVAL_TASKS, type EvalNodeFixture } from "./tasks.js";
import {
  ensureEvalPrincipal,
  failStuckEvalRuns,
  runEvalTask,
  type HarnessDeps,
} from "./harness.js";
import { aggregate, type EvalRunRecord, type EvalTaskOutcome } from "./metrics.js";

const evalEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  SANDBOX_IMAGE: z.string().min(1).default("node:22-bookworm-slim"),
  SANDBOX_COST_USD_PER_SEC: z.coerce.number().positive().default(0.000042),
  RUN_BUDGET_USD: z.coerce.number().positive().default(5),
  // Evals accumulate sandbox-time cost rows across runs in the same rolling
  // 24h window — default high enough that the breaker trips on real
  // anomalies, not on running the suite twice.
  EVAL_ORG_BUDGET_USD: z.coerce.number().positive().default(50),
  // CI passes `${{ secrets.X }}` which expands to "" when the secret is
  // absent — the env var is SET to empty, not unset, so treat "" as absent
  // (else scripted mode, which needs no key, dies on a min(1) violation).
  OPENROUTER_API_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional()),
  OPENROUTER_BASE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional()),
  LLM_CASSETTE_DIR: z.string().min(1).default("./.llm-cassettes"),
  GITHUB_SHA: z.string().optional(),
});

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const modeSchema = z.enum(["scripted", "live", "replay"]);

function gitVersion(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("evals are a dev/CI harness — refusing to run in production");
  }
  const env = evalEnvSchema.parse(process.env);
  const mode = modeSchema.parse(argValue("--mode") ?? "scripted");
  const only = argValue("--only");
  const historyPath = resolve(
    argValue("--history") ??
      fileURLToPath(new URL("../../../docs/evals/history.jsonl", import.meta.url)),
  );

  if ((mode === "live" || mode === "replay") && !env.OPENROUTER_API_KEY) {
    throw new Error(`--mode ${mode} needs OPENROUTER_API_KEY (replay validates wiring; the key is not called)`);
  }

  const { db, pool } = createDb(env.DATABASE_URL);
  try {
    await ensureEvalPrincipal(db);
    await failStuckEvalRuns(db);

    const openRouter =
      mode === "scripted"
        ? undefined
        : new OpenRouterClient({
            apiKey: env.OPENROUTER_API_KEY ?? "",
            db,
            ...(env.OPENROUTER_BASE_URL ? { baseUrl: env.OPENROUTER_BASE_URL } : {}),
            ...(mode === "replay"
              ? { fetchImpl: createRecordReplayFetch({ mode: "replay", dir: env.LLM_CASSETTE_DIR }) }
              : {}),
          });
    if (openRouter) await seedModelRouting(db);

    const scriptedTester: OneShotLlm = {
      completeChat: async () => ({
        content: JSON.stringify({ summary: "scripted tester report", failures: [] }),
        model: "scripted/tester",
        generationId: "gen-eval-tester",
        cost: 0,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }),
    };

    const coderLlmFor = (node: EvalNodeFixture, attempt: number): ToolCallingLlm => {
      if (openRouter) return openRouter;
      const attempts = node.scriptedAttempts;
      const turns = attempts[Math.min(attempt, attempts.length) - 1];
      if (!turns) throw new Error(`node ${node.taskId} has no scripted transcript`);
      return new ScriptedLlm(turns);
    };

    const deps: HarnessDeps = {
      db,
      driver: createSandboxDriver({ driver: "local" }),
      image: env.SANDBOX_IMAGE,
      sandboxCostPerSec: env.SANDBOX_COST_USD_PER_SEC,
      budget: { runBudgetUsd: env.RUN_BUDGET_USD, orgBudgetUsd: env.EVAL_ORG_BUDGET_USD },
      coderLlmFor,
      testerLlm: openRouter ?? scriptedTester,
    };

    const selected = only ? EVAL_TASKS.filter((t) => t.id.includes(only)) : EVAL_TASKS;
    if (selected.length === 0) throw new Error(`--only ${only} matched no tasks`);

    const outcomes: EvalTaskOutcome[] = [];
    for (const fixture of selected) {
      const outcome = await runEvalTask(fixture, deps);
      outcomes.push(outcome);
      const mark = outcome.status === "verified" ? "✓" : "✗";
      const expectNote = outcome.matchedExpectation ? "" : "  ← EXPECTATION MISMATCH";
      console.log(
        `${mark} ${outcome.taskId} (${outcome.title}) — ${outcome.status}, ` +
          `${outcome.nodes.reduce((s, n) => s + n.turns, 0)} turns, ` +
          `$${outcome.costUsd.toFixed(4)}, ${outcome.durationMs}ms${expectNote}`,
      );
    }

    const agg = aggregate(outcomes);
    console.log(
      `\npass ${agg.tasksPassed}/${agg.tasksTotal} (${(agg.passRate * 100).toFixed(1)}%) · ` +
        `retries ${agg.retries} · escalations ${agg.escalations} · ` +
        `cost $${agg.totalCostUsd.toFixed(4)} · turns ${agg.totalTurns}`,
    );

    if (!only) {
      const record: EvalRunRecord = {
        version: env.GITHUB_SHA?.slice(0, 7) ?? gitVersion(),
        timestamp: new Date().toISOString(),
        mode,
        aggregate: agg,
        tasks: outcomes,
      };
      await mkdir(dirname(historyPath), { recursive: true });
      await appendFile(historyPath, `${JSON.stringify(record)}\n`, "utf8");
      console.log(`recorded → ${historyPath}`);
    } else {
      console.log("(subset run — not recorded to history)");
    }

    if (mode === "scripted") {
      const mismatched = outcomes.filter((o) => !o.matchedExpectation);
      if (mismatched.length > 0) {
        console.error(
          `scripted-mode expectation mismatches: ${mismatched.map((o) => o.taskId).join(", ")}`,
        );
        process.exitCode = 1;
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
