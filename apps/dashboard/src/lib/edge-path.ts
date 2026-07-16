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
 * SVG path through dagre's full point list, each corner rounded via a
 * quadratic bend clamped to its segment lengths. Dagre's endpoints are
 * trusted as-is — they sit on whichever node border the edge actually
 * reaches, which matters for reversed edges (lower node → upper node):
 * anchoring those to the fixed top/bottom handles would drag the path
 * across the target card. Handle coordinates are only the no-points
 * fallback.
 */
export function buildEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  points?: LayoutPosition[],
): string {
  const path: LayoutPosition[] =
    points && points.length >= 2
      ? points
      : [
          { x: sourceX, y: sourceY },
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
 * Where the edge label chip sits: the point at fraction `t` of the polyline's
 * arc length. Default t=0.5 (the lane midpoint); antiparallel edge pairs get
 * staggered fractions so their two chips don't collide in the shared lane.
 */
export function labelAnchor(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  points?: LayoutPosition[],
  t = 0.5,
): LayoutPosition {
  const path: LayoutPosition[] =
    points && points.length >= 2
      ? points
      : [
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
        ];

  let total = 0;
  const lengths: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    const length = from !== undefined && to !== undefined ? dist(from, to) : 0;
    lengths.push(length);
    total += length;
  }
  const first = path[0];
  if (first === undefined) return { x: (sourceX + targetX) / 2, y: (sourceY + targetY) / 2 };
  if (total === 0) return first;

  let remaining = Math.min(Math.max(t, 0), 1) * total;
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    const length = lengths[i - 1] ?? 0;
    if (from === undefined || to === undefined) continue;
    if (remaining <= length || i === path.length - 1) {
      return towards(from, to, Math.min(remaining, length));
    }
    remaining -= length;
  }
  return first;
}
