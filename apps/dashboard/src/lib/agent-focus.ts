import type { GraphNode } from "@mullion/schemas";

// Pure half of the agent focus indicator (ADR-84): which nodes the agent
// just touched, derived from the streaming node list against a seen-map.
// The timing half (dwell queue) lives in hooks/use-agent-focus.ts.

export type FocusNode = Pick<GraphNode, "nodeKey" | "kind" | "revision" | "status">;

/**
 * Nodes newer than the seen-map, in list order. A node counts as newly
 * touched when its key is unseen or its revision is higher than the seen
 * revision. Removed nodes never enqueue — a ghosted card getting a bright
 * focus halo would contradict its own deprioritized treatment. The caller
 * owns bumping `seen` (via `markSeen`) so hydration can seed without
 * enqueuing.
 */
export function newlyTouchedNodeKeys(nodes: FocusNode[], seen: Map<string, number>): string[] {
  const touched: string[] = [];
  for (const node of nodes) {
    const seenRevision = seen.get(node.nodeKey);
    if (seenRevision !== undefined && node.revision <= seenRevision) continue;
    if (node.status !== "removed") touched.push(node.nodeKey);
  }
  return touched;
}

/** Record every node's current revision as seen. */
export function markSeen(nodes: FocusNode[], seen: Map<string, number>): void {
  for (const node of nodes) {
    const seenRevision = seen.get(node.nodeKey);
    if (seenRevision === undefined || node.revision > seenRevision) {
      seen.set(node.nodeKey, node.revision);
    }
  }
}

/** Which diagram pane a node lives on — mirrors the diagram's tab split. */
export function paneOf(nodeKey: string, nodes: FocusNode[]): "architecture" | "tasks" | null {
  const node = nodes.find((n) => n.nodeKey === nodeKey);
  if (!node) return null;
  return node.kind === "task" ? "tasks" : "architecture";
}
