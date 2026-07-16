import { describe, expect, it } from "vitest";
import { edgePointsKey, layoutGraph, type LayoutBox } from "./graph-layout";

const SERVICE: Omit<LayoutBox, "key"> = { width: 240, height: 100 };

function boxes(...keys: string[]): LayoutBox[] {
  return keys.map((key) => ({ key, ...SERVICE }));
}

describe("layoutGraph", () => {
  it("positions every box", () => {
    const { positions } = layoutGraph(boxes("a", "b"), [{ sourceKey: "a", targetKey: "b" }]);
    expect(positions.size).toBe(2);
    expect(positions.get("a")).toBeDefined();
    expect(positions.get("b")).toBeDefined();
  });

  it("returns waypoints for every registered link", () => {
    const { edgePoints } = layoutGraph(boxes("a", "b"), [{ sourceKey: "a", targetKey: "b" }]);
    const points = edgePoints.get(edgePointsKey("a", "b"));
    expect(points).toBeDefined();
    expect(points!.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps waypoints in the same coordinate space as positions", () => {
    const { positions, edgePoints } = layoutGraph(boxes("a", "b"), [{ sourceKey: "a", targetKey: "b" }]);
    const a = positions.get("a")!;
    const first = edgePoints.get(edgePointsKey("a", "b"))![0]!;
    // First waypoint starts at a's bottom border (TB layout): inside a's
    // horizontal span, at/after its bottom edge.
    expect(first.x).toBeGreaterThanOrEqual(a.x);
    expect(first.x).toBeLessThanOrEqual(a.x + SERVICE.width);
    expect(first.y).toBeGreaterThanOrEqual(a.y + SERVICE.height - 1);
  });

  it("omits links to unregistered nodes and self-loops", () => {
    const { edgePoints } = layoutGraph(boxes("a"), [
      { sourceKey: "a", targetKey: "missing" },
      { sourceKey: "a", targetKey: "a" },
    ]);
    expect(edgePoints.size).toBe(0);
  });

  it("gives a multi-rank edge interior waypoints to route around the middle rank", () => {
    // a -> b -> c chain plus a long a -> c edge spanning both ranks.
    const { edgePoints } = layoutGraph(boxes("a", "b", "c"), [
      { sourceKey: "a", targetKey: "b" },
      { sourceKey: "b", targetKey: "c" },
      { sourceKey: "a", targetKey: "c" },
    ]);
    const long = edgePoints.get(edgePointsKey("a", "c"));
    expect(long).toBeDefined();
    expect(long!.length).toBeGreaterThan(2);
  });
});
