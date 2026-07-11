"use client";

import { useState } from "react";
import { taskResultSchema, type BuildTask } from "@mullion/schemas";
import { TaskStatusPill, toneForTaskStatus } from "./build-status-badge";
import { ChevronIcon } from "../planning/icons";
import { describeFailureReason, formatCost, formatDuration } from "../../lib/build-format";

interface BuildTaskRowProps {
  task: BuildTask;
  // Looks up a dependency's current status by its specTaskId, for the
  // dependency chips below — null when the referenced task isn't (yet, or
  // ever) in this run's own list.
  dependencyStatus: (specTaskId: string) => BuildTask["status"] | null;
}

const DESCRIPTION_TRUNCATE_LENGTH = 140;

const DEP_CHIP_TONE_CLASS = {
  neutral: "border-border-strong text-fg-faint",
  progress: "border-accent/40 text-accent-strong",
  success: "border-success/40 text-success-strong",
  danger: "border-danger/40 text-danger",
  unknown: "border-border text-fg-faint",
} as const;

// task.result is jsonb (unknown at the trust boundary) — parsed with the
// same taskResultSchema the API/orchestrator already use to write it
// (CODING_STANDARDS §1), never sniffed field-by-field.
function parseTaskResult(result: unknown) {
  if (result === null || result === undefined) return null;
  const parsed = taskResultSchema.safeParse(result);
  return parsed.success ? parsed.data : null;
}

export function BuildTaskRow({ task, dependencyStatus }: BuildTaskRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isLong = task.description.length > DESCRIPTION_TRUNCATE_LENGTH;
  const result = parseTaskResult(task.result);
  const failureDetail = result && result.status === "failed" ? (result.detail ?? describeFailureReason(result.reason)) : null;

  return (
    <div className="animate-reveal flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg-muted">
            {task.specTaskId ?? task.id.slice(0, 8)}
          </span>
          {task.attempt > 1 ? (
            <span className="shrink-0 font-mono text-[11px] text-fg-faint">attempt {task.attempt}</span>
          ) : null}
        </div>
        <TaskStatusPill status={task.status} />
      </div>

      <div>
        <p className={`text-sm leading-relaxed text-fg ${expanded || !isLong ? "" : "line-clamp-2"}`}>{task.description}</p>
        {isLong ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="transition-swift mt-1 flex items-center gap-1 text-[11px] font-medium text-fg-faint hover:text-fg-muted"
          >
            <ChevronIcon className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
            {expanded ? "Show less" : "Show more"}
          </button>
        ) : null}
      </div>

      {task.dependsOn.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-fg-faint">depends on</span>
          {task.dependsOn.map((depId) => {
            const depStatus = dependencyStatus(depId);
            const tone = depStatus ? toneForTaskStatus(depStatus) : "unknown";
            return (
              <span key={depId} className={`border px-2 py-0.5 font-mono text-[10px] ${DEP_CHIP_TONE_CLASS[tone]}`}>
                {depId}
              </span>
            );
          })}
        </div>
      ) : null}

      {failureDetail ? (
        <p className="border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">{failureDetail}</p>
      ) : null}

      {result ? (
        <p className="font-mono text-[11px] text-fg-faint">
          {result.turns} turn{result.turns === 1 ? "" : "s"} · {formatDuration(result.durationMs)} · {formatCost(result.costUsd)}
        </p>
      ) : null}
    </div>
  );
}
