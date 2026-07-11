import { defineSignal, proxyActivities } from "@temporalio/workflow";
import { RETRY_BUDGET, dispositionFor, topoSort } from "./policy.js";
import type { BuildActivities, BuildRunInput, BuildRunResult } from "./types.js";

/**
 * The build orchestrator workflow (ADR-50). Owns the state machine,
 * topological dependency ordering, and the per-task retry budget — and does
 * ZERO IO. Every side effect is an activity. This module must import only
 * @temporalio/workflow + pure ./policy + ./types (no @mullion/{agents,db,
 * sandbox,llm}), or the isolate bundle breaks.
 */

// buildTask never throws (it returns failed{reason}), so activity-level
// Temporal retry fires ONLY on infra faults (sandbox create fail, DB down,
// worker killed mid-activity). Logical failures are handled by the workflow
// retry budget below (ADR-51). Infra retry is deep — a transient outage
// should resume, not exhaust in seconds and wedge the run — with a capped
// backoff; deterministic failures (spec parse, not-found) are thrown as
// ApplicationFailure.nonRetryable by the activity so they fail FAST into the
// workflow's catch instead of retrying pointlessly.
const RUN_TASK_RETRY = { maximumAttempts: 20, initialInterval: "2s", backoffCoefficient: 2, maximumInterval: "30s" };
const runTaskActs = proxyActivities<Pick<BuildActivities, "runTaskActivity">>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "2 minutes",
  retry: RUN_TASK_RETRY,
});
const acts = proxyActivities<Omit<BuildActivities, "runTaskActivity">>({
  startToCloseTimeout: "1 minute",
  retry: { maximumAttempts: 20, initialInterval: "1s", backoffCoefficient: 2, maximumInterval: "30s" },
});

// Escalation signal (ADR-51): DEFINED in M3 so the type is stable, but NOT
// handled — a paused workflow with no UI to signal it would hang. M4 wires
// setHandler + condition() here; M3 auto-fails at the escalation point.
export type EscalationDecision = "approve" | "abandon" | { redirect: string };
export const escalationSignal = defineSignal<[EscalationDecision]>("escalate");

// Default verify command for M3 (ADR-48 known-limit: no per-task test
// authoring yet — orchestration over M2's single-task capability).
const DEFAULT_VERIFY_COMMAND = "node --test";

export async function buildRunWorkflow(input: BuildRunInput): Promise<BuildRunResult> {
  const setStatus = (status: "building" | "done" | "failed"): Promise<void> =>
    acts.setRunStatusActivity({ runId: input.runId, organizationId: input.organizationId, status });

  try {
    return await orchestrate(input, setStatus);
  } catch (error) {
    // CRITICAL (ADR-52): a throw here — an activity that exhausted its infra
    // retry, or a deterministic non-retryable failure (spec parse) — must NOT
    // leave the run stuck in 'building' forever holding the ADR-29 slot with
    // no reaper. Move it to a terminal 'failed' (best-effort) and COMPLETE
    // the workflow with a failed result, so the run row is terminal and the
    // slot frees. Losing Temporal-level "Failed" visibility is fine — the run
    // row is the source of truth the user and ADR-29 read.
    await setStatus("failed").catch(() => undefined);
    return {
      status: "failed",
      tasksVerified: 0,
      tasksTotal: 0,
      failedReason: error instanceof Error ? error.message : "orchestration error",
    };
  }
}

async function orchestrate(
  input: BuildRunInput,
  setStatus: (status: "building" | "done" | "failed") => Promise<void>,
): Promise<BuildRunResult> {
  await setStatus("building");

  const graph = await acts.loadTaskGraphActivity({
    buildSpecId: input.buildSpecId,
    organizationId: input.organizationId,
  });

  let order;
  try {
    order = topoSort(graph);
  } catch (error) {
    await setStatus("failed");
    return {
      status: "failed",
      tasksVerified: 0,
      tasksTotal: graph.length,
      failedReason: error instanceof Error ? error.message : "invalid task graph",
    };
  }

  let verified = 0;
  for (const node of order) {
    const { taskRowId } = await acts.ensureTaskRowActivity({
      runId: input.runId,
      organizationId: input.organizationId,
      node,
      verifyCommand: DEFAULT_VERIFY_COMMAND,
    });

    const outcome = await runTaskWithBudget(input, node.task_id, taskRowId);
    if (outcome.status !== "verified") {
      await setStatus("failed");
      return {
        status: "failed",
        tasksVerified: verified,
        tasksTotal: order.length,
        failedTaskId: node.task_id,
        failedReason: outcome.reason,
      };
    }
    verified += 1;
  }

  await setStatus("done");
  return { status: "done", tasksVerified: verified, tasksTotal: order.length };
}

async function runTaskWithBudget(
  input: BuildRunInput,
  specTaskId: string,
  taskRowId: string,
): Promise<{ status: "verified" } | { status: "failed"; reason: string }> {
  for (let attempt = 1; ; attempt++) {
    const result = await runTaskActs.runTaskActivity({
      runId: input.runId,
      organizationId: input.organizationId,
      userId: input.userId,
      taskRowId,
      specTaskId,
      // The activity reads description/acceptanceCriteria/verifyCommand from
      // the task row (source of truth) — nothing else is threaded through
      // Temporal history per attempt.
      attempt,
    });

    if (result.status === "verified") return { status: "verified" };

    // budget_exceeded is terminal for the whole run — retrying spends more
    // against a ceiling already hit (ADR-51). The BUILD failed, but the
    // workflow SUCCEEDED at orchestrating it, so complete cleanly with a
    // failed result (which drives run.status = failed) rather than throwing
    // a workflow-level failure.
    if (dispositionFor(result.reason) === "terminal") {
      return { status: "failed", reason: result.reason };
    }

    if (attempt >= RETRY_BUDGET) {
      // M3: emit the escalation marker and auto-fail. M4 replaces this with
      // the human approve/redirect/abandon gate via escalationSignal.
      await acts.publishEscalationActivity({
        runId: input.runId,
        organizationId: input.organizationId,
        specTaskId,
        reason: result.reason,
      });
      return { status: "failed", reason: result.reason };
    }
  }
}
