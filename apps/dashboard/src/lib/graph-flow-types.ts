import type { Node, Edge } from "@xyflow/react";
import type { GraphNodeKind, GraphNodeStatus } from "@mullion/schemas";
import type { LayoutPosition } from "./graph-layout";

// Shared between architecture-diagram.tsx (builds these) and
// graph-node-card.tsx (renders these) — split out so neither file needs to
// import the other just for a type.

export interface GraphNodeCardData extends Record<string, unknown> {
  label: string;
  description: string;
  kind: GraphNodeKind;
  status: GraphNodeStatus;
  revision: number;
  flagged: boolean;
  // Agent focus indicator (ADR-84) — set on the one node the planning agent
  // is currently working on.
  focused: boolean;
  focusActor: string | null;
}

export type GraphFlowNode = Node<GraphNodeCardData, "graphNode">;

export interface GraphFlowEdgeData extends Record<string, unknown> {
  synthesized: boolean;
  status: GraphNodeStatus;
  // Dagre waypoints for the routed edge (ADR-85); absent → straight fallback.
  points?: LayoutPosition[] | undefined;
}

export type GraphFlowEdge = Edge<GraphFlowEdgeData, "routed">;
