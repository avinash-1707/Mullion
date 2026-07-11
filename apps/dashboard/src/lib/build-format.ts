import type { TaskFailureReason } from "@mullion/schemas";

// Small, pure display helpers shared across the build dashboard's
// components — kept dependency-free so they're trivially testable
// (CODING_STANDARDS §6) without a live query or EventSource in the loop.

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(3)}`;
}

export function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatClockTime(epochMs: number): string {
  try {
    return new Date(epochMs).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

// Human labels for the fixed failure-reason enum (packages/schemas
// coder-tools.ts) — used wherever a persisted TaskResult surfaces a reason.
const FAILURE_REASON_LABEL: Record<TaskFailureReason, string> = {
  turn_cap: "Hit the per-task turn limit",
  time_cap: "Hit the per-task time limit",
  cost_cap: "Hit the per-task cost limit",
  sandbox_died: "The sandbox crashed",
  llm_error: "The model call failed",
  protocol: "The agent's response didn't follow the expected protocol",
  crashed: "The task runner crashed unexpectedly",
  test_failed: "Tests didn't pass within the fix-cycle budget",
  budget_exceeded: "The run's budget was exhausted",
};

function isTaskFailureReason(value: string): value is TaskFailureReason {
  return value in FAILURE_REASON_LABEL;
}

// The live "task" stream event's `reason` is a plain string (not the strict
// enum) — translate it when it matches a known reason, otherwise show it
// verbatim rather than dropping information the server did send.
export function describeFailureReason(reason: string): string {
  return isTaskFailureReason(reason) ? FAILURE_REASON_LABEL[reason] : reason;
}
