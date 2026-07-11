import { Context } from "@temporalio/activity";
import { ApplicationFailure } from "@temporalio/common";
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@mullion/db";
import {
  DEFAULT_TASK_CAPS,
  buildTask,
  type BudgetConfig,
  type ToolCallingLlm,
  type Verifier,
} from "@mullion/agents";
import { buildSpecArtifactSchema, type TaskResult } from "@mullion/schemas";
import { reapContainersForRun, type SandboxDriver } from "@mullion/sandbox";
import type { TaskGraphNode } from "./policy.js";
import type { BuildActivities, RunStatus, RunTaskActivityArgs } from "./types.js";

/**
 * Side-effecting activity implementations (ADR-50). These run in the normal
 * Node runtime (not the workflow isolate), so they may touch Postgres,
 * Docker, and the LLM freely. Built via a DI factory that mirrors
 * buildTask(input, deps): the worker supplies real deps; tests supply fakes.
 */

export interface ActivityDeps {
  db: Db;
  llm: ToolCallingLlm;
  driver: SandboxDriver;
  sandboxCostPerSec: number;
  image?: string | undefined;
  budget?: BudgetConfig | undefined;
  /** Optional tamper-proof verifier factory (M2). Default = buildTask's inline verifier. */
  makeVerify?: ((args: { runId: string }) => Verifier) | undefined;
  /** Injected so the orchestrator stays decoupled from apps/api's SSE impl. */
  publishEvent?:
    | ((
        db: Db,
        args: { streamId: string; organizationId: string; eventType: string; payload: unknown },
      ) => Promise<void>)
    | undefined;
}

export function createActivities(deps: ActivityDeps): BuildActivities {
  return {
    async loadTaskGraphActivity({ buildSpecId, organizationId }): Promise<TaskGraphNode[]> {
      const rows = await deps.db
        .select()
        .from(schema.buildSpecs)
        .where(
          and(
            eq(schema.buildSpecs.id, buildSpecId),
            eq(schema.buildSpecs.organizationId, organizationId),
          ),
        )
        .limit(1);
      const row = rows[0];
      // Deterministic failures: retrying can't help, so fail FAST (non-retryable)
      // into the workflow's catch instead of burning the infra-retry budget.
      if (!row) {
        throw ApplicationFailure.nonRetryable(`build spec ${buildSpecId} not found for org`, "SpecNotFound");
      }
      const parsed = buildSpecArtifactSchema.safeParse(row.spec);
      if (!parsed.success) {
        throw ApplicationFailure.nonRetryable(
          `build spec ${buildSpecId} failed schema parse: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
          "SpecMalformed",
        );
      }
      return parsed.data.task_graph;
    },

    async ensureTaskRowActivity({ runId, organizationId, node, verifyCommand }): Promise<{
      taskRowId: string;
    }> {
      // Idempotent (ADR-52): a Temporal retry of this activity must not
      // create a duplicate task row. Unique (run_id, spec_task_id) +
      // ON CONFLICT DO NOTHING, then read back the row.
      await deps.db
        .insert(schema.tasks)
        .values({
          organizationId,
          runId,
          specTaskId: node.task_id,
          description: node.description,
          acceptanceCriteria: node.acceptance_criteria,
          dependsOn: node.depends_on,
          verifyCommand,
        })
        .onConflictDoNothing();
      const rows = await deps.db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.runId, runId),
            eq(schema.tasks.organizationId, organizationId),
            eq(schema.tasks.specTaskId, node.task_id),
          ),
        )
        .limit(1);
      const taskRowId = rows[0]?.id;
      if (!taskRowId) throw new Error(`ensureTaskRow could not read back task ${node.task_id}`);
      return { taskRowId };
    },

    async setRunStatusActivity({ runId, organizationId, status }): Promise<void> {
      await setRunStatus(deps, runId, organizationId, status);
    },

    async runTaskActivity(args: RunTaskActivityArgs): Promise<TaskResult> {
      // Reap any sandbox orphaned by a prior crashed attempt of this run
      // (ADR-52) before spinning a fresh one. Safe: returns 0 if Docker is
      // unreachable (e.g. E2B driver), never throws.
      await reapContainersForRun(args.runId).catch(() => 0);

      // Heartbeat so Temporal detects a dead worker within heartbeatTimeout
      // rather than waiting the full startToCloseTimeout (buildTask is long).
      const heartbeat = setInterval(() => {
        try {
          Context.current().heartbeat(args.attempt);
        } catch {
          // Not in a real activity context (unit test) — ignore.
        }
      }, 20_000);
      heartbeat.unref?.();

      // create() is INSIDE the try so its throw (an infra fault this
      // milestone must survive) still clears the heartbeat interval.
      let sandbox: Awaited<ReturnType<SandboxDriver["create"]>> | undefined;
      try {
        // Record the attempt for observability (ADR-52).
        await deps.db
          .update(schema.tasks)
          .set({ attempt: args.attempt })
          .where(
            and(
              eq(schema.tasks.id, args.taskRowId),
              eq(schema.tasks.organizationId, args.organizationId),
            ),
          );

        // description/acceptanceCriteria/verifyCommand live on the task row —
        // the single source of truth; nothing is threaded through history.
        const rows = await deps.db
          .select({
            description: schema.tasks.description,
            acceptanceCriteria: schema.tasks.acceptanceCriteria,
            verifyCommand: schema.tasks.verifyCommand,
          })
          .from(schema.tasks)
          .where(
            and(
              eq(schema.tasks.id, args.taskRowId),
              eq(schema.tasks.organizationId, args.organizationId),
            ),
          )
          .limit(1);
        const taskRow = rows[0];
        if (!taskRow) {
          throw ApplicationFailure.nonRetryable(`task row ${args.taskRowId} not found`, "TaskRowMissing");
        }

        sandbox = await deps.driver.create({
          ...(deps.image !== undefined ? { image: deps.image } : {}),
          timeoutMs: DEFAULT_TASK_CAPS.wallClockMs + 60_000,
          runId: args.runId,
        });

        return await buildTask(
          {
            task: {
              taskId: args.specTaskId,
              description: taskRow.description,
              acceptanceCriteria: taskRow.acceptanceCriteria ?? "",
            },
            verifyCommand: taskRow.verifyCommand ?? "node --test",
            caps: DEFAULT_TASK_CAPS,
            costContext: {
              organizationId: args.organizationId,
              userId: args.userId,
              runId: args.runId,
            },
            organizationId: args.organizationId,
            runId: args.runId,
            taskRowId: args.taskRowId,
            userId: args.userId,
          },
          {
            sandbox,
            llm: deps.llm,
            db: deps.db,
            sandboxCostPerSec: deps.sandboxCostPerSec,
            ...(deps.budget !== undefined ? { budget: deps.budget } : {}),
            ...(deps.makeVerify !== undefined
              ? { verify: deps.makeVerify({ runId: args.runId }) }
              : {}),
          },
        );
      } finally {
        clearInterval(heartbeat);
        if (sandbox) await sandbox.dispose().catch(() => undefined);
      }
    },

    async publishEscalationActivity({ runId, organizationId, specTaskId, reason }): Promise<void> {
      if (!deps.publishEvent) return;
      await deps.publishEvent(deps.db, {
        streamId: runId,
        organizationId,
        eventType: "escalation_required",
        payload: { specTaskId, reason },
      });
    },
  };
}

async function setRunStatus(
  deps: ActivityDeps,
  runId: string,
  organizationId: string,
  status: RunStatus,
): Promise<void> {
  await deps.db
    .update(schema.runs)
    .set({ status })
    .where(and(eq(schema.runs.id, runId), eq(schema.runs.organizationId, organizationId)));
  if (deps.publishEvent) {
    await deps.publishEvent(deps.db, {
      streamId: runId,
      organizationId,
      eventType: "phase",
      payload: { status },
    });
  }
}
