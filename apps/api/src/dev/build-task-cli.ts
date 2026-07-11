/**
 * M1 dev harness (locked-plan decision #3: CLI, no HTTP route until M3).
 * Feeds one task from the latest frozen Build Spec through the Coder
 * tool-loop against the configured sandbox driver and prints the
 * transcript. Dev-only — refuses to run in production.
 *
 * Usage (from apps/api):
 *   pnpm exec tsx --env-file=.env src/dev/build-task-cli.ts \
 *     [--task <spec_task_id>] [--verify "<command>"] [--llm scripted|openrouter]
 *
 * `--llm scripted` (default: no OpenRouter key needed) drives a canned
 * happy-path transcript; `--llm openrouter` uses the real client (works
 * against the loopback mock via OPENROUTER_BASE_URL, or live creds later).
 */
import { and, desc, eq, notInArray } from "drizzle-orm";
import { schema } from "@mullion/db";
import { OpenRouterClient } from "@mullion/llm";
import {
  DEFAULT_TASK_CAPS,
  buildTask,
  makeTesterVerifier,
  type OneShotLlm,
  type ToolCallingLlm,
} from "@mullion/agents";
import { ScriptedLlm, toolCall } from "@mullion/agents/testing";
import { buildSpecArtifactSchema } from "@mullion/schemas";
import { createSandboxDriver, reapContainersForRun } from "@mullion/sandbox";
import { db, pool } from "../db.js";
import { env } from "../env.js";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  if (env.NODE_ENV === "production") {
    throw new Error("build-task-cli is a dev harness — refusing to run in production");
  }

  // Startup reaper (ADR-46): a prior crash leaves a run wedged in a
  // non-terminal status, which ADR-29's unique index would turn into a
  // permanent 409 — mark it failed and remove any labeled containers.
  const stuck = await db
    .select()
    .from(schema.runs)
    .where(notInArray(schema.runs.status, ["done", "failed"]));
  for (const run of stuck) {
    await db.update(schema.runs).set({ status: "failed" }).where(eq(schema.runs.id, run.id));
    // Non-terminal task rows would otherwise linger in 'pending'/'running'
    // forever and mislead later status queries.
    await db
      .update(schema.tasks)
      .set({ status: "failed", result: { status: "failed", reason: "crashed", turns: 0, costUsd: 0, durationMs: 0 } })
      .where(
        and(
          eq(schema.tasks.runId, run.id),
          notInArray(schema.tasks.status, ["verified", "failed"]),
        ),
      );
    const reaped = await reapContainersForRun(run.id);
    console.log(`reaped stuck run ${run.id} (status was ${run.status}, ${reaped} containers removed)`);
  }

  const specRows = await db
    .select()
    .from(schema.buildSpecs)
    .orderBy(desc(schema.buildSpecs.frozenAt))
    .limit(1);
  const specRow = specRows[0];
  if (!specRow) {
    throw new Error("no frozen Build Spec found — run a planning session to completion first");
  }
  const artifact = buildSpecArtifactSchema.parse(specRow.spec);

  const wantedTaskId = argValue("--task");
  const specTask = wantedTaskId
    ? artifact.task_graph.find((t) => t.task_id === wantedTaskId)
    : (artifact.task_graph.find((t) => t.depends_on.length === 0) ?? artifact.task_graph[0]);
  if (!specTask) {
    throw new Error(`task "${wantedTaskId ?? "<first>"}" not found in the Build Spec task_graph`);
  }

  const sessionRows = await db
    .select()
    .from(schema.planningSessions)
    .where(eq(schema.planningSessions.id, specRow.sessionId))
    .limit(1);
  const session = sessionRows[0];
  if (!session) throw new Error("Build Spec has no parent session");

  const verifyCommand = argValue("--verify") ?? "node --test";
  const llmMode = argValue("--llm") ?? "scripted";

  const [run] = await db
    .insert(schema.runs)
    .values({
      organizationId: specRow.organizationId,
      userId: session.userId,
      buildSpecId: specRow.id,
      status: "building",
    })
    .returning();
  if (!run) throw new Error("run insert returned nothing");

  const [taskRow] = await db
    .insert(schema.tasks)
    .values({
      organizationId: specRow.organizationId,
      runId: run.id,
      specTaskId: specTask.task_id,
      description: specTask.description,
      acceptanceCriteria: specTask.acceptance_criteria,
      dependsOn: specTask.depends_on,
      verifyCommand,
    })
    .returning();
  if (!taskRow) throw new Error("task insert returned nothing");

  // Runner-owned test (ADR-48): written into the FRESH verify sandbox, so
  // the Coder cannot tamper with what grades it.
  const runnerTest = {
    path: "sum.test.js",
    content: [
      "const { test } = require('node:test');",
      "const assert = require('node:assert');",
      "const { sum } = require('./sum.js');",
      "test('sum adds', () => { assert.strictEqual(sum(2, 3), 5); });",
    ].join("\n"),
  };
  const testCommand = "node --test sum.test.js";

  const openRouter =
    llmMode === "openrouter"
      ? new OpenRouterClient({
          apiKey: env.OPENROUTER_API_KEY,
          db,
          referer: env.API_ORIGIN,
          ...(env.OPENROUTER_BASE_URL ? { baseUrl: env.OPENROUTER_BASE_URL } : {}),
        })
      : undefined;

  const llm: ToolCallingLlm =
    openRouter ??
    new ScriptedLlm([
      {
        toolCalls: [
          toolCall("c1", "writeFile", {
            path: "sum.js",
            content: "exports.sum = (a, b) => a + b;",
          }),
        ],
      },
      { toolCalls: [toolCall("c2", "submit", {})] },
    ]);

  // Tester one-shot LLM: the real client in openrouter mode, else a canned
  // green report (the deterministic exit code still decides pass/fail).
  const testerLlm =
    openRouter ??
    ({
      completeChat: async () => ({
        content: JSON.stringify({ summary: "parsed by scripted tester", failures: [] }),
        model: "scripted/tester",
        generationId: "gen-scripted",
        cost: 0,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }),
    } satisfies OneShotLlm);

  const driver = createSandboxDriver({
    driver: env.SANDBOX_DRIVER,
    e2bApiKey: env.E2B_API_KEY,
  });
  const sandbox = await driver.create({
    image: env.SANDBOX_IMAGE,
    timeoutMs: DEFAULT_TASK_CAPS.wallClockMs + 60_000,
    runId: run.id,
  });

  console.log(`run ${run.id} · task ${specTask.task_id} · sandbox ${sandbox.id} (${driver.name})`);
  console.log(`verify command: ${verifyCommand}\n`);

  try {
    const result = await buildTask(
      {
        task: {
          taskId: specTask.task_id,
          description: specTask.description,
          acceptanceCriteria: specTask.acceptance_criteria,
        },
        verifyCommand,
        caps: DEFAULT_TASK_CAPS,
        costContext: {
          organizationId: specRow.organizationId,
          userId: session.userId,
          runId: run.id,
        },
        organizationId: specRow.organizationId,
        runId: run.id,
        taskRowId: taskRow.id,
        userId: session.userId,
      },
      {
        sandbox,
        llm,
        db,
        sandboxCostPerSec: env.SANDBOX_COST_USD_PER_SEC,
        budget: { runBudgetUsd: env.RUN_BUDGET_USD, orgBudgetUsd: env.ORG_DAILY_LLM_BUDGET_USD },
        verify: makeTesterVerifier({
          driver,
          llm: testerLlm,
          runnerTests: [runnerTest],
          testCommand,
          image: env.SANDBOX_IMAGE,
          sandboxTimeoutMs: DEFAULT_TASK_CAPS.wallClockMs + 60_000,
          db,
          sandboxCostPerSec: env.SANDBOX_COST_USD_PER_SEC,
        }),
      },
    );

    await db
      .update(schema.runs)
      .set({ status: result.status === "verified" ? "done" : "failed" })
      .where(eq(schema.runs.id, run.id));

    const transcript = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.taskId, taskRow.id))
      .orderBy(schema.messages.seq);
    console.log(`--- transcript (${transcript.length} messages) ---`);
    for (const row of transcript) {
      console.log(JSON.stringify(row.envelope));
    }
    console.log(`--- result ---`);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "verified" ? 0 : 1;
  } catch (error) {
    await db.update(schema.runs).set({ status: "failed" }).where(eq(schema.runs.id, run.id));
    throw error;
  } finally {
    await sandbox.dispose();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
