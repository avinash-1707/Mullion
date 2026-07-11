import type { Node } from "@xyflow/react";
import type { BuildTask } from "@mullion/schemas";

// Shared between build-agent-graph.tsx (builds these) and
// build-task-node-card.tsx (renders these) — same split as
// graph-flow-types.ts/graph-node-card.tsx for the planning diagram.

export interface BuildGraphNodeData extends Record<string, unknown> {
  displayId: string;
  description: string;
  status: BuildTask["status"];
  attempt: number;
  // True only for the one node named by the run's active escalation, if any.
  isEscalated: boolean;
}

export type BuildGraphFlowNode = Node<BuildGraphNodeData, "buildTaskNode">;
