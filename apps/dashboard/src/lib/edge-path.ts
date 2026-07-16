import type { LayoutPosition } from "./graph-layout";

// Pure geometry for the routed edge (ADR-85), kept out of the component so
// it can be unit-tested without React Flow. Builds an orthogonal-ish rounded
// polyline: React Flow's real handle coordinates at the ends, dagre's
// interior waypoints in the middle.

// 8px corners, deliberately under the cards' 12px (rounded-xl) — edges read
// as subordinate line-weight, not competing objects.
const CORNER_RADIUS = 8;
// Dagre can emit short jogs around a tight lane; an unclamped radius would
// self-intersect on them.
const MAX_RADIUS_SEGMENT_FRACTION = 0.4;

function dist(a: LayoutPosition, b: LayoutPosition): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function towards(from: LayoutPosition, to: LayoutPosition, distance: number): LayoutPosition {
  const length = dist(from, to);
  if (length === 0) return from;
  const t = distance / length;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/**
 * SVG path from source handle → interior waypoints → target handle, with each
 * interior corner rounded via a quadratic bend clamped to its segment lengths.
 * `points` is dagre's full point list; its first/last entries approximate the
 * node borders and are replaced by the exact handle coordinates.
 */
export function buildEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  points?: LayoutPosition[],
): string {
  const interior = points && points.length > 2 ? points.slice(1, -1) : [];
  const path: LayoutPosition[] = [
    { x: sourceX, y: sourceY },
    ...interior,
    { x: targetX, y: targetY },
  ];

  // Collapse consecutive duplicates — zero-length segments break rounding math.
  const waypoints = path.filter((p, i) => {
    const prev = path[i - 1];
    return prev === undefined || dist(p, prev) > 0.01;
  });
  const first = waypoints[0];
  const last = waypoints[waypoints.length - 1];
  if (first === undefined || last === undefined || waypoints.length < 2) {
    return `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
  }

  let d = `M ${first.x},${first.y}`;
  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = waypoints[i - 1];
    const corner = waypoints[i];
    const next = waypoints[i + 1];
    if (prev === undefined || corner === undefined || next === undefined) continue;
    const radius = Math.min(
      CORNER_RADIUS,
      dist(prev, corner) * MAX_RADIUS_SEGMENT_FRACTION,
      dist(corner, next) * MAX_RADIUS_SEGMENT_FRACTION,
    );
    const entry = towards(corner, prev, radius);
    const exit = towards(corner, next, radius);
    d += ` L ${entry.x},${entry.y} Q ${corner.x},${corner.y} ${exit.x},${exit.y}`;
  }
  d += ` L ${last.x},${last.y}`;
  return d;
}

/**
 * Where the edge label chip sits: the middle dagre waypoint (in the clear
 * lane between ranks) when one exists, else the segment midpoint.
 */
export function labelAnchor(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  points?: LayoutPosition[],
): LayoutPosition {
  const interior = points && points.length > 2 ? points.slice(1, -1) : [];
  const mid = interior[Math.floor(interior.length / 2)];
  if (mid !== undefined) return mid;
  return { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };
}
