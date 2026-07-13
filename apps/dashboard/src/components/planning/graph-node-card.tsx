"use client";

import { useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphFlowNode } from "../../lib/graph-flow-types";
import { DatastoreIcon, ExternalIcon, ServiceIcon, TaskIcon, WarningIcon } from "./icons";

const KIND_CONFIG = {
  service: {
    icon: ServiceIcon,
    color: "var(--color-accent)",
    tint: "var(--color-accent-soft)",
    label: "Service",
  },
  datastore: {
    icon: DatastoreIcon,
    color: "var(--color-node-datastore)",
    tint: "var(--color-node-datastore-soft)",
    label: "Datastore",
  },
  external: {
    icon: ExternalIcon,
    color: "var(--color-node-external)",
    tint: "var(--color-node-external-soft)",
    label: "External",
  },
  task: {
    icon: TaskIcon,
    color: "var(--color-fg-muted)",
    tint: "transparent",
    label: "Task",
  },
} as const;

// The one custom node type registered with React Flow — a single component
// switching on `data.kind` rather than four separate node-type components,
// since they share every behavior (revision flash, ghosting, flagging) and
// differ only in color/icon/size.
export function GraphNodeCard({ data, selected }: NodeProps<GraphFlowNode>) {
  const config = KIND_CONFIG[data.kind];
  const Icon = config.icon;
  const isTask = data.kind === "task";
  const isRemoved = data.status === "removed";

  // One-shot highlight on revision bump (not on first mount) — signals "this
  // node just changed" without becoming a permanent or looping decoration.
  const previousRevision = useRef(data.revision);
  const [flashing, setFlashing] = useState(false);
  useEffect(() => {
    if (data.revision !== previousRevision.current) {
      previousRevision.current = data.revision;
      setFlashing(true);
    }
  }, [data.revision]);

  return (
    <div
      onAnimationEnd={() => setFlashing(false)}
      className={[
        "animate-reveal border bg-surface px-4 py-3 shadow-[0_8px_20px_-12px_rgba(0,0,0,0.55)]",
        isTask ? "w-[180px]" : "w-[240px]",
        isRemoved
          ? "border-dashed border-border opacity-45"
          : data.kind === "external"
            ? "border-dashed border-border-strong"
            : "border-border-strong",
        data.flagged && !isRemoved ? "ring-2 ring-danger/60" : "",
        selected && !isRemoved ? "ring-2 ring-accent/50" : "",
        flashing ? "animate-flash-once" : "",
      ].join(" ")}
      style={{ borderLeftWidth: isRemoved ? undefined : "3px", borderLeftColor: isRemoved ? undefined : config.color }}
    >
      <Handle type="target" position={Position.Top} className="!bg-border-strong" />
      <Handle type="source" position={Position.Bottom} className="!bg-border-strong" />

      <div className="flex items-start justify-between gap-2">
        <div
          className="flex items-center gap-1.5 px-2 py-0.5"
          style={{
            color: isRemoved ? "var(--color-fg-faint)" : config.color,
            backgroundColor: isRemoved || isTask ? "transparent" : config.tint,
          }}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="font-mono text-[10px] uppercase tracking-wide">{config.label}</span>
        </div>
        <div className="flex items-center gap-1">
          {data.flagged && !isRemoved ? <WarningIcon className="h-3.5 w-3.5 text-danger" /> : null}
          {data.revision > 1 ? (
            <span className="bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
              rev {data.revision}
            </span>
          ) : null}
        </div>
      </div>

      <p className={`mt-1.5 text-sm font-semibold leading-snug ${isRemoved ? "text-fg-faint line-through" : "text-fg"}`}>
        {data.label}
      </p>
      {data.description ? (
        <p className={`mt-1 line-clamp-2 text-xs leading-relaxed ${isRemoved ? "text-fg-faint" : "text-fg-muted"}`}>
          {data.description}
        </p>
      ) : null}
      {isRemoved ? (
        <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">Removed - kept for history</p>
      ) : null}
    </div>
  );
}
