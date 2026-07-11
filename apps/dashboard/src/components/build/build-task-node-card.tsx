"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { BuildTask } from "@mullion/schemas";
import type { BuildGraphFlowNode } from "../../lib/build-graph-flow-types";
import { TaskStatusPill } from "./build-status-badge";
import { WarningIcon } from "../planning/icons";
import { useReducedMotion } from "../../hooks/use-reduced-motion";

// One hue per task status via a left-border stripe — the execution
// counterpart to graph-node-card.tsx's per-kind stripe (there: what is this;
// here: what state is it in), so the build graph reads as the same product's
// live-progress view rather than a different visual system.
// Record<status, …> (not `as const`) so a new task status fails to compile
// HERE, forcing the map to be completed, rather than at the lookup site.
const STATUS_STRIPE: Record<BuildTask["status"], string> = {
  pending: "var(--color-fg-faint)",
  running: "var(--color-accent)",
  verified: "var(--color-success)",
  failed: "var(--color-danger)",
};

export function BuildTaskNodeCard({ data, selected }: NodeProps<BuildGraphFlowNode>) {
  const reducedMotion = useReducedMotion();
  const { displayId, description, status, attempt, isEscalated } = data;

  // Escalation overrides the routine status treatment even when the task's
  // own status is still "running" underneath — ADR-07: this must read as an
  // interruption, not "business as usual, just in progress."
  const isRunning = status === "running" && !isEscalated;

  return (
    <div
      className={[
        "animate-reveal w-[224px] border bg-surface px-4 py-3 shadow-[0_8px_20px_-12px_rgba(0,0,0,0.55)]",
        isEscalated ? "border-danger bg-danger-soft" : status === "failed" ? "border-danger/40" : "border-border-strong",
        // 75 not lower: the description is text-fg-muted over the graph bg,
        // and whole-card opacity below ~75 drops it under WCAG AA contrast.
        status === "pending" && !isEscalated ? "opacity-75" : "",
        isRunning ? (reducedMotion ? "ring-2 ring-accent/50" : "animate-pulse-glow") : "",
        selected && !isEscalated && !isRunning ? "ring-2 ring-accent/50" : "",
      ].join(" ")}
      style={{ borderLeftWidth: "3px", borderLeftColor: isEscalated ? "var(--color-danger)" : STATUS_STRIPE[status] }}
    >
      <Handle type="target" position={Position.Top} className="!bg-border-strong" />
      <Handle type="source" position={Position.Bottom} className="!bg-border-strong" />

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 bg-elevated px-2 py-0.5 font-mono text-[11px] text-fg-muted">{displayId}</span>
          {attempt > 1 ? <span className="shrink-0 font-mono text-[10px] text-fg-faint">attempt {attempt}</span> : null}
        </div>
        {isEscalated ? (
          <WarningIcon className="h-3.5 w-3.5 shrink-0 text-danger" />
        ) : (
          <TaskStatusPill status={status} />
        )}
      </div>

      <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-fg-muted">{description}</p>

      {isEscalated ? (
        <p className="mt-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-danger">Needs decision</p>
      ) : null}
    </div>
  );
}
