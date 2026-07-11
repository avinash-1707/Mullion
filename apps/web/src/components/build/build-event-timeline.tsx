"use client";

import { useEffect, useRef, useState } from "react";
import type { BuildTimelineEntry } from "../../lib/build-timeline-reducer";
import { useReducedMotion } from "../../hooks/use-reduced-motion";
import { CheckIcon, DownloadIcon, ServiceIcon, TaskIcon, WarningIcon } from "../planning/icons";
import { describeFailureReason, formatClockTime } from "../../lib/build-format";

interface BuildEventTimelineProps {
  entries: BuildTimelineEntry[];
}

const TASK_STATUS_VERB: Record<"running" | "verified" | "failed", string> = {
  running: "started",
  verified: "verified",
  failed: "failed",
};

function TimelineRow({ entry }: { entry: BuildTimelineEntry }) {
  const { event } = entry;
  const time = <span className="font-mono text-[11px] text-fg-faint">{formatClockTime(entry.receivedAt)}</span>;

  switch (event.kind) {
    case "phase":
      return (
        <div className="animate-reveal flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5">
          <ServiceIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-faint" />
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <p className="text-xs text-fg-muted">
              Run status → <span className="font-medium text-fg">{event.status}</span>
            </p>
            {time}
          </div>
        </div>
      );

    case "task": {
      const verb = TASK_STATUS_VERB[event.task.status];
      const isFailed = event.task.status === "failed";
      return (
        <div
          className={`animate-reveal flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 ${
            isFailed ? "border-danger/25 bg-danger-soft" : "border-border bg-surface"
          }`}
        >
          <TaskIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isFailed ? "text-danger" : "text-fg-faint"}`} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <p className={`text-xs ${isFailed ? "text-danger" : "text-fg-muted"}`}>
                Task <span className="font-mono">{event.task.specTaskId}</span> {verb}
                {event.task.attempt > 1 ? ` (attempt ${event.task.attempt})` : ""}
              </p>
              {time}
            </div>
            {event.task.reason ? (
              <p className="text-[11px] text-danger/85">{describeFailureReason(event.task.reason)}</p>
            ) : null}
            {event.task.turns !== undefined || event.task.costUsd !== undefined ? (
              <p className="font-mono text-[11px] text-fg-faint">
                {event.task.turns !== undefined ? `${event.task.turns} turns` : null}
                {event.task.turns !== undefined && event.task.costUsd !== undefined ? " · " : null}
                {event.task.costUsd !== undefined ? `$${event.task.costUsd.toFixed(3)}` : null}
              </p>
            ) : null}
          </div>
        </div>
      );
    }

    case "escalation_required":
      return (
        <div className="animate-reveal flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5">
          <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-danger">
                Escalation requested on <span className="font-mono">{event.specTaskId}</span>
              </p>
              {time}
            </div>
            <p className="text-[11px] leading-relaxed text-danger/85">{event.reason}</p>
          </div>
        </div>
      );

    case "review_result":
      return (
        <div
          className={`animate-reveal flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 ${
            event.verdict.approved ? "border-success/30 bg-success-soft" : "border-danger/25 bg-danger-soft"
          }`}
        >
          {event.verdict.approved ? (
            <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success-strong" />
          ) : (
            <WarningIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className={`text-xs font-medium ${event.verdict.approved ? "text-success-strong" : "text-danger"}`}>
                Review: {event.verdict.approved ? "Approved" : "Changes requested"}
              </p>
              {time}
            </div>
            {event.verdict.notes.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {event.verdict.notes.map((note, index) => (
                  <li key={`${note.severity}-${index}`} className="text-[11px] leading-relaxed text-fg-muted">
                    <span
                      className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        note.severity === "blocker" ? "bg-danger-soft text-danger" : "bg-elevated text-fg-muted"
                      }`}
                    >
                      {note.severity}
                    </span>
                    {note.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      );

    case "delivery_result":
      return (
        <div className="animate-reveal flex items-start gap-2.5 rounded-xl border border-accent/30 bg-accent-soft px-3.5 py-2.5">
          <DownloadIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-strong" />
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <p className="text-xs text-fg">
              Delivery ready — {event.deliveries.length} artifact{event.deliveries.length === 1 ? "" : "s"}
              {event.isPartial ? <span className="ml-1.5 text-accent-strong">(partial)</span> : null}
            </p>
            {time}
          </div>
        </div>
      );

    default: {
      const exhaustive: never = event;
      throw new Error(`Unhandled timeline event: ${JSON.stringify(exhaustive)}`);
    }
  }
}

// Chronological log of every stream event, newest at the bottom — same
// scroll-pinning behavior as planning/decision-log-panel.tsx (auto-follow
// unless the user has scrolled up to read history).
export function BuildEventTimeline({ entries }: BuildEventTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion ? "instant" : "smooth" });
  }, [entries.length, stickToBottom, reducedMotion]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickToBottom(distanceFromBottom < 48);
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-bg">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-fg">Event timeline</h2>
        <p className="text-xs text-fg-faint">Every phase, task, review, and delivery event, in order.</p>
      </div>
      <div ref={scrollRef} onScroll={handleScroll} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-fg-faint">Waiting for the first event…</p>
        ) : (
          entries.map((entry) => <TimelineRow key={entry.key} entry={entry} />)
        )}
      </div>
    </div>
  );
}
