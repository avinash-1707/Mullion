import { Context } from "@temporalio/activity";
import { ApplicationFailure } from "@temporalio/common";
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@mullion/db";
import {
  DEFAULT_TASK_CAPS,
  buildReviewerAgent,
  buildTask,
  withBackoff,
  type BudgetConfig,
  type OneShotLlm,
  type ToolCallingLlm,
  type Verifier,
} from "@mullion/agents";
import { buildSpecArtifactSchema, type TaskResult } from "@mullion/schemas";
import { reapContainersForRun, type Sandbox, type SandboxDriver } from "@mullion/sandbox";
import { assertSafeArtifactPath, type ArtifactStore } from "@mullion/artifacts";
import type { DeliveryTarget } from "@mullion/delivery";
import type { TaskGraphNode } from "./policy.js";
import type {
  BuildActivities,
  ReviewActivityResult,
  RunStatus,
  RunTaskActivityArgs,
  ShipActivityResult,
} from "./types.js";

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
  /** M4 (ADR-53): durable store for produced files; snapshot after each task. */
  artifactStore?: ArtifactStore | undefined;
  /** M4: one-shot LLM for the Reviewer (the OpenRouterClient satisfies this). */
  reviewLlm?: OneShotLlm | undefined;
  /** M4 (ADR-54): delivery targets tried in order (archive always; github if linked). */
  deliveryTargets?: DeliveryTarget[] | undefined;
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

        // Task-level feed for the build dashboard (02 §7.1): best-effort —
        // a publish failure must never fail the task itself.
        await publishTaskEvent(deps, args, { status: "running", attempt: args.attempt });

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

        // ADR-55: an escalation redirect is the one sanctioned free-text
        // input during build — appended to the task description for this
        // attempt, scoped to this one task.
        const description = args.redirectInstruction
          ? `${taskRow.description}\n\n[Operator redirect]: ${args.redirectInstruction}`
          : taskRow.description;

        const result = await buildTask(
          {
            task: {
              taskId: args.specTaskId,
              description,
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

        // Snapshot produced files into the durable store BEFORE dispose,
        // regardless of verified/failed — a partial task's files still belong
        // in the delivered repo (ADR-33/53). BEST-EFFORT: a snapshot error must
        // never fail an already-verified task (which would burn budget on a
        // fruitless re-run).
        if (deps.artifactStore) {
          await snapshotSandbox(deps.artifactStore, sandbox, args.runId, result.producedPaths).catch(
            (error) => console.error(`snapshot failed for run ${args.runId} (non-fatal):`, error),
          );
        }
        await publishTaskEvent(deps, args, {
          status: result.status === "verified" ? "verified" : "failed",
          attempt: args.attempt,
          turns: result.turns,
          costUsd: result.costUsd,
          ...(result.status === "failed" ? { reason: result.reason } : {}),
        });
        return result;
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

    async reviewActivity({ runId, organizationId, buildSpecId }): Promise<ReviewActivityResult> {
      // Advisory review over the produced tree (ADR-54). If no LLM/store is
      // wired, degrade to auto-approve rather than blocking the build.
      if (!deps.reviewLlm || !deps.artifactStore) return { approved: true, blockerCount: 0 };

      const [specRow] = await deps.db
        .select({ spec: schema.buildSpecs.spec })
        .from(schema.buildSpecs)
        .where(
          and(eq(schema.buildSpecs.id, buildSpecId), eq(schema.buildSpecs.organizationId, organizationId)),
        )
        .limit(1);
      const parsed = specRow ? buildSpecArtifactSchema.safeParse(specRow.spec) : undefined;
      const requirementsSummary =
        parsed?.success && typeof parsed.data.requirements["summary"] === "string"
          ? (parsed.data.requirements["summary"] as string)
          : "(no summary)";

      const taskRows = await deps.db
        .select({
          specTaskId: schema.tasks.specTaskId,
          acceptanceCriteria: schema.tasks.acceptanceCriteria,
          status: schema.tasks.status,
        })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.runId, runId), eq(schema.tasks.organizationId, organizationId)));

      const decisions = await deps.db
        .select({ actor: schema.decisionLog.actor, decision: schema.decisionLog.decision })
        .from(schema.decisionLog)
        .where(
          and(
            eq(schema.decisionLog.buildSpecId, buildSpecId),
            eq(schema.decisionLog.organizationId, organizationId),
          ),
        )
        .limit(50);

      // Cap what reaches the reviewer prompt — MAX_SNAPSHOT_BYTES bounds
      // disk, not context/cost (Phase 3 audit). Oversized trees review a
      // prefix and say so, rather than blowing the window or the budget.
      const allFiles = await deps.artifactStore.readTree(runId);
      const files: typeof allFiles = [];
      let reviewBytes = 0;
      for (const file of allFiles) {
        if (files.length >= MAX_REVIEW_FILES || reviewBytes >= MAX_REVIEW_BYTES) {
          files.push({
            path: "_review_note.txt",
            content: `NOTE: ${allFiles.length - files.length} more file(s) omitted from review (size cap)`,
          });
          break;
        }
        const content =
          file.content.length > MAX_REVIEW_FILE_CHARS
            ? `${file.content.slice(0, MAX_REVIEW_FILE_CHARS)}\n…[truncated for review]`
            : file.content;
        reviewBytes += content.length;
        files.push({ path: file.path, content });
      }

      const verdict = await withBackoff(async () => {
        const completion = await deps.reviewLlm!.completeChat({
          role: "reviewer",
          messages: buildReviewerAgent.buildMessages({
            requirementsSummary,
            tasks: taskRows.map((t) => ({
              taskId: t.specTaskId ?? "?",
              acceptanceCriteria: t.acceptanceCriteria ?? "",
              status: t.status,
            })),
            decisionLog: decisions.map((d) => ({ actor: d.actor, decision: d.decision })),
            files,
          }),
          costContext: { organizationId, runId },
        });
        return buildReviewerAgent.parse(completion.content);
      });

      // Record the verdict as an append-only decision (actor reviewer) + SSE.
      await deps.db.insert(schema.decisionLog).values({
        organizationId,
        buildSpecId,
        phase: "build",
        actor: "reviewer",
        decision: verdict.approved ? "Build review: approved" : "Build review: concerns raised",
        rationale: verdict.notes.map((n) => `[${n.severity}] ${n.message}`).join("\n") || null,
      });
      if (deps.publishEvent) {
        await deps.publishEvent(deps.db, {
          streamId: runId,
          organizationId,
          eventType: "review_result",
          payload: { approved: verdict.approved, notes: verdict.notes },
        });
      }
      return { approved: verdict.approved, blockerCount: verdict.notes.filter((n) => n.severity === "blocker").length };
    },

    async shipActivity({ runId, organizationId, userId, isPartial, summary }): Promise<ShipActivityResult> {
      const repo = deps.artifactStore ? await deps.artifactStore.readTree(runId) : [];
      // 12 hex chars of the uuid (dashes stripped) — 8 raw chars could
      // include a dash and collide across a user's runs (Phase 3 audit).
      const repoName = `mullion-build-${runId.replace(/-/g, "").slice(0, 12)}`;

      // Idempotency across Temporal retries: a kind already delivered for this
      // run is skipped, so a retry (e.g. after one target threw) doesn't
      // duplicate rows or re-create a repo.
      const existing = await deps.db
        .select({ kind: schema.deliveries.kind })
        .from(schema.deliveries)
        .where(and(eq(schema.deliveries.runId, runId), eq(schema.deliveries.organizationId, organizationId)));
      const already = new Set(existing.map((r) => r.kind));

      const deliveries: { kind: string; ref: string }[] = [];
      for (const target of deps.deliveryTargets ?? []) {
        if (already.has(target.kind)) continue;
        // Per-target isolation (ADR-54): one target failing must not abort the
        // others or wedge the run — record what worked, skip what didn't.
        try {
          if (!(await target.available(userId))) continue;
          const result = await target.deliver({ runId, organizationId, userId, repo, repoName, isPartial, summary });
          await deps.db.insert(schema.deliveries).values({
            organizationId,
            runId,
            kind: result.kind,
            ref: result.ref,
            isPartial,
            summary,
          });
          deliveries.push({ kind: result.kind, ref: result.ref });
        } catch (error) {
          // Log message/status only — never the full error object around a
          // credential-bearing client (Phase-2 gate).
          const detail =
            error instanceof Error ? error.message : typeof error === "string" ? error : "unknown error";
          console.error(`delivery target "${target.kind}" failed for run ${runId}: ${detail}`);
        }
      }

      if (deps.publishEvent) {
        await deps.publishEvent(deps.db, {
          streamId: runId,
          organizationId,
          eventType: "delivery_result",
          payload: { deliveries, isPartial },
        });
      }
      return { deliveries };
    },
  };
}

// Reviewer prompt caps (Phase 3 audit): advisory review reads a bounded
// slice, never the raw 50MB snapshot ceiling.
const MAX_REVIEW_FILES = 60;
const MAX_REVIEW_BYTES = 400_000;
const MAX_REVIEW_FILE_CHARS = 20_000;

// Per-run total-bytes ceiling for snapshotted artifacts — the in-container
// caps don't cover host disk (Phase-2 security gate). A produced tree over
// this is truncated (files past the budget skipped) rather than exhausting
// ARTIFACT_DIR.
const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;

async function snapshotSandbox(
  store: ArtifactStore,
  sandbox: Sandbox,
  runId: string,
  producedPaths: string[],
): Promise<void> {
  const files = [];
  let totalBytes = 0;
  for (const path of producedPaths) {
    // Per-file guard: an unsafe path or an unreadable file is skipped, not
    // fatal — one bad path must not drop the whole snapshot.
    try {
      assertSafeArtifactPath(path);
    } catch {
      continue;
    }
    const content = await sandbox.readFile(path).catch(() => undefined);
    if (content === undefined) continue;
    totalBytes += Buffer.byteLength(content, "utf8");
    if (totalBytes > MAX_SNAPSHOT_BYTES) {
      console.error(`snapshot for run ${runId} exceeded ${MAX_SNAPSHOT_BYTES} bytes — remaining files skipped`);
      break;
    }
    files.push({ path, content });
  }
  if (files.length > 0) await store.put(runId, files);
}

async function publishTaskEvent(
  deps: ActivityDeps,
  args: { runId: string; organizationId: string; specTaskId: string },
  payload: Record<string, unknown>,
): Promise<void> {
  if (!deps.publishEvent) return;
  await deps
    .publishEvent(deps.db, {
      streamId: args.runId,
      organizationId: args.organizationId,
      eventType: "task",
      payload: { specTaskId: args.specTaskId, ...payload },
    })
    .catch((error) =>
      console.error(`task event publish failed for run ${args.runId} (non-fatal):`, error),
    );
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
