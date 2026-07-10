import type { Node, Edge } from "@xyflow/react";
import type { GraphNodeKind, GraphNodeStatus } from "@mullion/schemas";

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
}

export type GraphFlowNode = Node<GraphNodeCardData, "graphNode">;

export interface GraphFlowEdgeData extends Record<string, unknown> {
  synthesized: boolean;
  status: GraphNodeStatus;
}

export type GraphFlowEdge = Edge<GraphFlowEdgeData>;
