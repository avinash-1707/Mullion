import { describe, expect, it } from "vitest";
import { buildEdgePath, labelAnchor } from "../edge-path";

describe("buildEdgePath", () => {
  it("falls back to a straight line without waypoints", () => {
    expect(buildEdgePath(0, 0, 100, 100)).toBe("M 0,0 L 100,100");
    expect(buildEdgePath(0, 0, 100, 100, [])).toBe("M 0,0 L 100,100");
  });

  it("draws a straight line between two dagre points", () => {
    const path = buildEdgePath(0, 0, 100, 100, [
      { x: 2, y: 2 },
      { x: 98, y: 98 },
    ]);
    expect(path).toBe("M 2,2 L 98,98");
  });

  it("routes through interior waypoints with rounded corners", () => {
    const path = buildEdgePath(0, 0, 100, 100, [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 100 },
    ]);
    expect(path.startsWith("M 0,0")).toBe(true);
    expect(path).toContain("Q 50,0");
    expect(path.endsWith("L 100,100")).toBe(true);
  });

  it("trusts dagre's endpoints over the handle coordinates", () => {
    // A reversed edge (lower node → upper node) reaches the target's BOTTOM
    // border; anchoring to the fixed top handle would drag the path across
    // the target card.
    const path = buildEdgePath(10, 20, 90, 80, [
      { x: 12, y: 22 },
      { x: 50, y: 50 },
      { x: 88, y: 78 },
    ]);
    expect(path.startsWith("M 12,22")).toBe(true);
    expect(path.endsWith("L 88,78")).toBe(true);
  });

  it("clamps the corner radius on short segments instead of self-intersecting", () => {
    // Corner 5px after the previous point: entry point must stay between them.
    const path = buildEdgePath(0, 0, 100, 10, [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 100, y: 10 },
    ]);
    const entryX = Number(path.match(/L ([\d.]+),/)?.[1]);
    expect(entryX).toBeGreaterThan(0);
    expect(entryX).toBeLessThan(5);
  });

  it("survives duplicate consecutive waypoints", () => {
    const path = buildEdgePath(0, 0, 100, 100, [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
    ]);
    expect(path.startsWith("M 0,0")).toBe(true);
    expect(path.endsWith("L 100,100")).toBe(true);
  });
});

describe("labelAnchor", () => {
  it("defaults to the arc-length midpoint", () => {
    expect(
      labelAnchor(0, 0, 100, 0, [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toEqual({ x: 50, y: 0 });
  });

  it("places the chip at fraction t of the polyline's total length", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    // Total length 200: t=0.5 is the corner, t=0.75 is halfway down.
    expect(labelAnchor(0, 0, 100, 100, points, 0.5)).toEqual({ x: 100, y: 0 });
    expect(labelAnchor(0, 0, 100, 100, points, 0.75)).toEqual({ x: 100, y: 50 });
  });

  it("clamps t to [0, 1]", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(labelAnchor(0, 0, 100, 0, points, -1)).toEqual({ x: 0, y: 0 });
    expect(labelAnchor(0, 0, 100, 0, points, 2)).toEqual({ x: 100, y: 0 });
  });

  it("falls back to the handle midpoint without points", () => {
    expect(labelAnchor(0, 0, 100, 50)).toEqual({ x: 50, y: 25 });
  });
});
