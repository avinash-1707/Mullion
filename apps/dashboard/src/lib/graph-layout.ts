import dagre from "dagre";

// Pure layout function, deliberately decoupled from @xyflow/react's Node/Edge
// types — it only needs stable keys + box dimensions in, positions out. Kept
// here (not inline in the diagram component) so it stays independently
// reasoned-about and swappable without touching render logic.

export interface LayoutBox {
  key: string;
  width: number;
  height: number;
}

export interface LayoutLink {
  sourceKey: string;
  targetKey: string;
}

export interface LayoutPosition {
  x: number;
  y: number;
}

const RANK_SEP = 96;
const NODE_SEP = 56;
const MARGIN = 32;

export function layoutGraph(boxes: LayoutBox[], links: LayoutLink[]): Map<string, LayoutPosition> {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "TB", nodesep: NODE_SEP, ranksep: RANK_SEP, marginx: MARGIN, marginy: MARGIN });

  for (const box of boxes) {
    graph.setNode(box.key, { width: box.width, height: box.height });
  }

  for (const link of links) {
    // The graph streams in incrementally — an edge can arrive referencing a
    // node the client hasn't received yet (or a synthesized task-dependency
    // edge pointing at a node dropped by a later revision). Dagre throws on
    // an edge to an unregistered node, so skip rather than crash the layout
    // for what is, structurally, a normal mid-stream state.
    if (graph.hasNode(link.sourceKey) && graph.hasNode(link.targetKey) && link.sourceKey !== link.targetKey) {
      graph.setEdge(link.sourceKey, link.targetKey);
    }
  }

  dagre.layout(graph);

  const positions = new Map<string, LayoutPosition>();
  for (const box of boxes) {
    const placed = graph.node(box.key);
    positions.set(box.key, { x: placed.x - box.width / 2, y: placed.y - box.height / 2 });
  }
  return positions;
}
