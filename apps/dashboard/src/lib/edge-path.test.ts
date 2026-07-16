import { describe, expect, it } from "vitest";
import { buildEdgePath, labelAnchor } from "./edge-path";

describe("buildEdgePath", () => {
  it("falls back to a straight line without waypoints", () => {
    expect(buildEdgePath(0, 0, 100, 100)).toBe("M 0,0 L 100,100");
    expect(buildEdgePath(0, 0, 100, 100, [])).toBe("M 0,0 L 100,100");
  });

  it("treats two dagre points (endpoints only) as a straight line", () => {
    const path = buildEdgePath(0, 0, 100, 100, [
      { x: 2, y: 2 },
      { x: 98, y: 98 },
    ]);
    expect(path).toBe("M 0,0 L 100,100");
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

  it("anchors ends to the handle coordinates, not dagre's border approximations", () => {
    const path = buildEdgePath(10, 20, 90, 80, [
      { x: 12, y: 22 },
      { x: 50, y: 50 },
      { x: 88, y: 78 },
    ]);
    expect(path.startsWith("M 10,20")).toBe(true);
    expect(path.endsWith("L 90,80")).toBe(true);
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
  it("uses the middle interior waypoint when one exists", () => {
    const anchor = labelAnchor(0, 0, 100, 100, [
      { x: 0, y: 0 },
      { x: 30, y: 40 },
      { x: 60, y: 50 },
      { x: 90, y: 60 },
      { x: 100, y: 100 },
    ]);
    expect(anchor).toEqual({ x: 60, y: 50 });
  });

  it("falls back to the segment midpoint without interior waypoints", () => {
    expect(labelAnchor(0, 0, 100, 50)).toEqual({ x: 50, y: 25 });
    expect(
      labelAnchor(0, 0, 100, 50, [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
      ]),
    ).toEqual({ x: 50, y: 25 });
  });
});
