import { describe, expect, it } from "vitest";
import { dispositionFor, topoSort, type TaskGraphNode } from "./policy.js";

function node(id: string, deps: string[] = []): TaskGraphNode {
  return { task_id: id, description: id, acceptance_criteria: "ok", depends_on: deps };
}

describe("topoSort", () => {
  it("orders a linear chain", () => {
    const order = topoSort([node("c", ["b"]), node("b", ["a"]), node("a")]);
    expect(order.map((n) => n.task_id)).toEqual(["a", "b", "c"]);
  });

  it("preserves declared order among independent nodes (deterministic)", () => {
    const order = topoSort([node("a"), node("b"), node("c")]);
    expect(order.map((n) => n.task_id)).toEqual(["a", "b", "c"]);
  });

  it("respects a diamond dependency", () => {
    const order = topoSort([
      node("d", ["b", "c"]),
      node("b", ["a"]),
      node("c", ["a"]),
      node("a"),
    ]).map((n) => n.task_id);
    expect(order[0]).toBe("a");
    expect(order[3]).toBe("d");
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("d"));
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("d"));
  });

  it("throws on a cycle", () => {
    expect(() => topoSort([node("a", ["b"]), node("b", ["a"])])).toThrowError(/cycle/);
  });

  it("throws on a dangling dependency", () => {
    expect(() => topoSort([node("a", ["ghost"])])).toThrowError(/unknown task/);
  });

  it("handles an empty graph", () => {
    expect(topoSort([])).toEqual([]);
  });
});

describe("dispositionFor", () => {
  it("marks budget_exceeded terminal", () => {
    expect(dispositionFor("budget_exceeded")).toBe("terminal");
  });

  it("marks every other reason retryable", () => {
    for (const reason of [
      "test_failed",
      "turn_cap",
      "time_cap",
      "sandbox_died",
      "llm_error",
      "protocol",
      "crashed",
    ] as const) {
      expect(dispositionFor(reason)).toBe("retry");
    }
  });
});
