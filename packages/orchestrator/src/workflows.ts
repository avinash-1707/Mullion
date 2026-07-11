import { condition, defineSignal, proxyActivities, setHandler } from "@temporalio/workflow";
import { RETRY_BUDGET, dispositionFor, topoSort, type TaskGraphNode } from "./policy.js";
import type { BuildActivities, BuildRunInput, BuildRunResult, RunStatus } from "./types.js";

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
// Reviewer + DevOps (M4) call an LLM / push a repo — longer than the fast ops.
const reviewShipActs = proxyActivities<Pick<BuildActivities, "reviewActivity" | "shipActivity">>({
  startToCloseTimeout: "10 minutes",
  retry: { maximumAttempts: 5, initialInterval: "2s", backoffCoefficient: 2, maximumInterval: "30s" },
});
const acts = proxyActivities<
  Omit<BuildActivities, "runTaskActivity" | "reviewActivity" | "shipActivity">
>({
  startToCloseTimeout: "1 minute",
  retry: { maximumAttempts: 20, initialInterval: "1s", backoffCoefficient: 2, maximumInterval: "30s" },
});

// Escalation signal (ADR-55): WIRED in M4. On retry-budget exhaustion the
// workflow pauses and awaits a human decision; a timeout defaults to abandon
// so an unattended gate can't hang forever holding the ADR-29 slot.
export type EscalationDecision = "approve" | "abandon" | { redirect: string };
export const escalationSignal = defineSignal<[EscalationDecision]>("escalate");
// Bounded wait for the human gate before defaulting to abandon.
const ESCALATION_TIMEOUT = "30 minutes";
// A redirect resets the retry budget once; cap total redirects so it can't loop.
const MAX_REDIRECTS = 2;

const DEFAULT_VERIFY_COMMAND = "node --test";

export async function buildRunWorkflow(input: BuildRunInput): Promise<BuildRunResult> {
  // Escalation state: the signal handler records the human decision; the
  // task loop waits on it via condition() (ADR-55).
  let pendingEscalation: EscalationDecision | undefined;
  setHandler(escalationSignal, (decision) => {
    pendingEscalation = decision;
  });
  const takeEscalation = (): EscalationDecision | undefined => {
    const d = pendingEscalation;
    pendingEscalation = undefined;
    return d;
  };

  const setStatus = (status: RunStatus): Promise<void> =>
    acts.setRunStatusActivity({ runId: input.runId, organizationId: input.organizationId, status });

  try {
    return await orchestrate(input, setStatus, takeEscalation, () => pendingEscalation !== undefined);
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

type TaskOutcome = "verified" | "accepted-incomplete" | "abandoned" | "skipped" | "failed";

async function orchestrate(
  input: BuildRunInput,
  setStatus: (status: RunStatus) => Promise<void>,
  takeEscalation: () => EscalationDecision | undefined,
  hasEscalation: () => boolean,
): Promise<BuildRunResult> {
  await setStatus("building");

  const graph = await acts.loadTaskGraphActivity({
    buildSpecId: input.buildSpecId,
    organizationId: input.organizationId,
  });

  let order: TaskGraphNode[];
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

  // ADR-33: the build runs to a terminal DELIVERY regardless of per-task
  // failures. Collect outcomes, skipping tasks whose dependencies didn't
  // complete, then review + ship over whatever was produced.
  const outcomes = new Map<string, TaskOutcome>();
  let verified = 0;
  const isComplete = (o: TaskOutcome): boolean => o === "verified" || o === "accepted-incomplete";

  for (const node of order) {
    const depsIncomplete = node.depends_on.some((d) => !isComplete(outcomes.get(d) ?? "skipped"));
    if (depsIncomplete) {
      outcomes.set(node.task_id, "skipped");
      continue;
    }

    const { taskRowId } = await acts.ensureTaskRowActivity({
      runId: input.runId,
      organizationId: input.organizationId,
      node,
      verifyCommand: DEFAULT_VERIFY_COMMAND,
    });

    const outcome = await runTaskWithGate(input, node.task_id, taskRowId, takeEscalation, hasEscalation);
    outcomes.set(node.task_id, outcome);
    if (outcome === "verified") verified += 1;
  }

  const allVerified = order.every((n) => outcomes.get(n.task_id) === "verified");
  const anyProduced = order.some((n) => isComplete(outcomes.get(n.task_id) ?? "skipped"));
  const isPartial = !allVerified;

  // Review (M4): ADVISORY — a review failure must NEVER gate delivery
  // (ADR-54). Any error is treated as "no review" and the build still ships.
  let reviewApproved: boolean | undefined;
  if (anyProduced) {
    await setStatus("reviewing");
    try {
      const review = await reviewShipActs.reviewActivity({
        runId: input.runId,
        organizationId: input.organizationId,
        buildSpecId: input.buildSpecId,
      });
      reviewApproved = review.approved;
    } catch {
      reviewApproved = undefined; // review unavailable — ship anyway
    }
  }

  // Ship (M4, ADR-33): package + deliver on EVERY terminal path — full,
  // partial, or abandoned — with a "what's built / missing" summary.
  await setStatus("shipping");
  const summary = buildSummary(order, outcomes, reviewApproved);
  const ship = await reviewShipActs.shipActivity({
    runId: input.runId,
    organizationId: input.organizationId,
    userId: input.userId,
    isPartial,
    summary,
  });

  await setStatus(allVerified ? "done" : "failed");
  return {
    status: allVerified ? "done" : "failed",
    tasksVerified: verified,
    tasksTotal: order.length,
    ...(reviewApproved !== undefined ? { reviewApproved } : {}),
    deliveries: ship.deliveries,
    ...(isPartial ? { failedReason: "one or more tasks did not verify" } : {}),
  };
}

function buildSummary(
  order: TaskGraphNode[],
  outcomes: Map<string, TaskOutcome>,
  reviewApproved: boolean | undefined,
): string {
  const lines = order.map((n) => `- ${n.task_id}: ${outcomes.get(n.task_id) ?? "skipped"}`);
  const review =
    reviewApproved === undefined ? "no review" : reviewApproved ? "review approved" : "review flagged concerns";
  return [`Task outcomes:`, ...lines, ``, `Review: ${review}`].join("\n");
}

/**
 * Runs one task with the workflow retry budget and, on exhaustion, the human
 * escalation gate (ADR-55). Returns a per-task outcome (never fails the run —
 * ADR-33 delivery happens regardless).
 */
async function runTaskWithGate(
  input: BuildRunInput,
  specTaskId: string,
  taskRowId: string,
  takeEscalation: () => EscalationDecision | undefined,
  hasEscalation: () => boolean,
): Promise<TaskOutcome> {
  let redirects = 0;
  let redirectInstruction: string | undefined;
  let budgetBase = 0; // attempts are counted from here; a redirect resets it

  for (let attempt = budgetBase + 1; ; attempt++) {
    const result = await runTaskActs.runTaskActivity({
      runId: input.runId,
      organizationId: input.organizationId,
      userId: input.userId,
      taskRowId,
      specTaskId,
      attempt,
      ...(redirectInstruction !== undefined ? { redirectInstruction } : {}),
    });

    if (result.status === "verified") return "verified";

    // budget_exceeded is terminal for the whole task — no retry helps.
    if (dispositionFor(result.reason) === "terminal") return "failed";

    if (attempt - budgetBase >= RETRY_BUDGET) {
      // Retry budget exhausted → human escalation gate (ADR-07/55).
      await acts.publishEscalationActivity({
        runId: input.runId,
        organizationId: input.organizationId,
        specTaskId,
        reason: result.reason,
      });
      const decided = await condition(hasEscalation, ESCALATION_TIMEOUT);
      const decision: EscalationDecision = decided ? takeEscalation()! : "abandon";

      if (decision === "approve") return "accepted-incomplete";
      if (decision === "abandon") return "abandoned";
      // redirect: the ONE sanctioned free-text-during-build input (ADR-55).
      if (redirects >= MAX_REDIRECTS) return "abandoned";
      redirects += 1;
      redirectInstruction = decision.redirect;
      budgetBase = attempt; // reset the budget for the redirected attempt(s)
    }
  }
}
