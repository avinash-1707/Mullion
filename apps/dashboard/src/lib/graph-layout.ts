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

export interface LayoutResult {
  positions: Map<string, LayoutPosition>;
  // Dagre's own per-edge waypoints (ADR-85), keyed `${sourceKey}->${targetKey}`,
  // in the same absolute coordinate space as positions. Multi-rank edges are
  // threaded through dummy-node lanes that clear the node boxes — these points
  // are what lets edges route around cards instead of cutting across them.
  edgePoints: Map<string, LayoutPosition[]>;
}

// Spacing leaves room for the edge lanes between ranks (ADR-85).
const RANK_SEP = 120;
const NODE_SEP = 72;
const EDGE_SEP = 24;
const MARGIN = 32;

export function edgePointsKey(sourceKey: string, targetKey: string): string {
  return `${sourceKey}->${targetKey}`;
}

export function layoutGraph(boxes: LayoutBox[], links: LayoutLink[]): LayoutResult {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "TB",
    nodesep: NODE_SEP,
    ranksep: RANK_SEP,
    edgesep: EDGE_SEP,
    marginx: MARGIN,
    marginy: MARGIN,
  });

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

  const edgePoints = new Map<string, LayoutPosition[]>();
  for (const e of graph.edges()) {
    // @types/dagre omits `points`, but dagre populates it at runtime.
    const placed = graph.edge(e) as { points?: LayoutPosition[] };
    edgePoints.set(edgePointsKey(e.v, e.w), placed.points ?? []);
  }

  return { positions, edgePoints };
}
