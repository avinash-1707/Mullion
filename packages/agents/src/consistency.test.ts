import { describe, expect, it } from "vitest";
import type { GraphEdge, GraphNode } from "@mullion/schemas";
import { checkGraphStructure } from "./consistency.js";

let counter = 0;
function node(partial: Partial<GraphNode> & Pick<GraphNode, "nodeKey" | "kind">): GraphNode {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    label: partial.nodeKey,
    description: "",
    status: "active",
    revision: 1,
    dependsOn: [],
    decisionId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

function edge(sourceKey: string, targetKey: string, status: "active" | "removed" = "active"): GraphEdge {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    sourceKey,
    targetKey,
    status,
  };
}

describe("checkGraphStructure", () => {
  it("passes a clean connected graph", () => {
    const nodes = [
      node({ nodeKey: "api", kind: "service" }),
      node({ nodeKey: "db", kind: "datastore" }),
      node({ nodeKey: "t1", kind: "task" }),
      node({ nodeKey: "t2", kind: "task", dependsOn: ["t1"] }),
    ];
    const edges = [edge("api", "db")];
    expect(checkGraphStructure(nodes, edges)).toEqual([]);
  });

  it("flags an edge referencing a nonexistent node", () => {
    const nodes = [node({ nodeKey: "api", kind: "service" })];
    const issues = checkGraphStructure(nodes, [edge("api", "ghost")]);
    expect(issues.map((i) => i.code)).toContain("dangling_edge");
  });

  it("flags an edge referencing a removed node", () => {
    const nodes = [
      node({ nodeKey: "api", kind: "service" }),
      node({ nodeKey: "cache", kind: "datastore", status: "removed" }),
    ];
    const issues = checkGraphStructure(nodes, [edge("api", "cache")]);
    expect(issues.map((i) => i.code)).toContain("reference_to_removed_node");
  });

  it("flags a task depending on a removed or missing task", () => {
    const nodes = [
      node({ nodeKey: "t1", kind: "task", status: "removed" }),
      node({ nodeKey: "t2", kind: "task", dependsOn: ["t1", "never-existed"] }),
    ];
    const codes = checkGraphStructure(nodes, []).map((i) => i.code);
    expect(codes).toContain("reference_to_removed_node");
    expect(codes).toContain("missing_task_dependency");
  });

  it("flags dependency cycles", () => {
    const nodes = [
      node({ nodeKey: "t1", kind: "task", dependsOn: ["t2"] }),
      node({ nodeKey: "t2", kind: "task", dependsOn: ["t1"] }),
    ];
    const codes = checkGraphStructure(nodes, []).map((i) => i.code);
    expect(codes).toContain("dependency_cycle");
  });

  it("flags orphan components only in multi-component graphs", () => {
    const lonely = [node({ nodeKey: "api", kind: "service" })];
    expect(checkGraphStructure(lonely, [])).toEqual([]);

    const nodes = [
      node({ nodeKey: "api", kind: "service" }),
      node({ nodeKey: "db", kind: "datastore" }),
      node({ nodeKey: "island", kind: "external" }),
    ];
    const issues = checkGraphStructure(nodes, [edge("api", "db")]);
    expect(issues.map((i) => i.code)).toEqual(["orphan_node"]);
    expect(issues[0]?.nodeKeys).toEqual(["island"]);
  });
});
