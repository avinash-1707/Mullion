"use client";

import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import type { GraphFlowEdge } from "../../lib/graph-flow-types";
import { buildEdgePath, labelAnchor } from "../../lib/edge-path";

// The one custom edge type (ADR-85): follows dagre's waypoints so the path
// routes around node cards instead of cutting across them. Ends anchor to
// React Flow's real handle coordinates; the interior comes from the layout.
// The label renders as a chip on the HTML layer, anchored to a mid waypoint
// — in the clear lane between ranks, never buried under a card.
export function RoutedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  label,
  data,
}: EdgeProps<GraphFlowEdge>) {
  const path = buildEdgePath(sourceX, sourceY, targetX, targetY, data?.points);
  const anchor = labelAnchor(sourceX, sourceY, targetX, targetY, data?.points, data?.labelT ?? 0.5);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        {...(markerEnd !== undefined ? { markerEnd } : {})}
        {...(style !== undefined ? { style } : {})}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${anchor.x}px, ${anchor.y}px)`,
            }}
            className="pointer-events-none bg-surface px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-fg-muted shadow-[0_2px_6px_-2px_rgba(0,0,0,0.5)]"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
