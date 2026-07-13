import { z } from "zod";
import {
  consistencyIssueSchema,
  type ConsistencyIssue,
  type GraphEdge,
  type GraphNode,
  type RequirementsDoc,
} from "@mullion/schemas";
import type { AgentSpec, ChatMessage } from "./agent.js";
import { parseJsonWith } from "./json.js";

/**
 * The consistency gate (01 §4.3 / 02 §2.3): structural problems are found
 * deterministically in code; only requirement-level judgment (contradiction,
 * coverage) uses the Reviewer model. Confirmation stays blocked until both
 * report clean.
 *
 * Trust note: the reviewer LLM reads node text that user input influenced,
 * so its verdict is advisory — steerable by prompt injection. The security
 * backstops are the deterministic checks below and the explicit human
 * confirm (ADR-02); never treat a reviewer "pass" as a trust boundary.
 */

export function checkGraphStructure(nodes: GraphNode[], edges: GraphEdge[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const activeNodes = nodes.filter((n) => n.status === "active");
  const activeByKey = new Map(activeNodes.map((n) => [n.nodeKey, n]));
  const removedKeys = new Set(nodes.filter((n) => n.status === "removed").map((n) => n.nodeKey));

  for (const edge of edges.filter((e) => e.status === "active")) {
    for (const key of [edge.sourceKey, edge.targetKey]) {
      if (activeByKey.has(key)) continue;
      issues.push({
        code: removedKeys.has(key) ? "reference_to_removed_node" : "dangling_edge",
        message: `Edge ${edge.sourceKey} → ${edge.targetKey} references "${key}", which ${removedKeys.has(key) ? "was removed" : "does not exist"}`,
        nodeKeys: [edge.sourceKey, edge.targetKey],
      });
    }
  }

  const activeTasks = activeNodes.filter((n) => n.kind === "task");
  for (const task of activeTasks) {
    for (const dep of task.dependsOn) {
      if (activeByKey.has(dep)) continue;
      issues.push({
        code: removedKeys.has(dep) ? "reference_to_removed_node" : "missing_task_dependency",
        message: `Task "${task.label}" depends on "${dep}", which ${removedKeys.has(dep) ? "was removed" : "does not exist"}`,
        nodeKeys: [task.nodeKey, dep],
      });
    }
  }

  issues.push(...findDependencyCycles(activeTasks));

  // A component wired to nothing is a plan smell — but only flag it when
  // the graph is big enough that isolation can't be intentional.
  const activeComponents = activeNodes.filter((n) => n.kind !== "task");
  if (activeComponents.length > 1) {
    const connected = new Set<string>();
    for (const edge of edges.filter((e) => e.status === "active")) {
      connected.add(edge.sourceKey);
      connected.add(edge.targetKey);
    }
    for (const node of activeComponents) {
      if (!connected.has(node.nodeKey)) {
        issues.push({
          code: "orphan_node",
          message: `"${node.label}" (${node.nodeKey}) has no data/call-flow connection to anything`,
          nodeKeys: [node.nodeKey],
        });
      }
    }
  }

  return issues;
}

function findDependencyCycles(tasks: GraphNode[]): ConsistencyIssue[] {
  const byKey = new Map(tasks.map((t) => [t.nodeKey, t]));
  const state = new Map<string, "visiting" | "done">();
  const issues: ConsistencyIssue[] = [];

  const visit = (key: string, path: string[]): void => {
    const status = state.get(key);
    if (status === "done") return;
    if (status === "visiting") {
      const cycleStart = path.indexOf(key);
      const cycle = [...path.slice(cycleStart), key];
      issues.push({
        code: "dependency_cycle",
        message: `Task dependency cycle: ${cycle.join(" → ")}`,
        nodeKeys: cycle,
      });
      return;
    }
    state.set(key, "visiting");
    const node = byKey.get(key);
    for (const dep of node?.dependsOn ?? []) {
      if (byKey.has(dep)) visit(dep, [...path, key]);
    }
    state.set(key, "done");
  };

  for (const task of tasks) visit(task.nodeKey, []);
  return issues;
}

// ---------------------------------------------------------------------------
// Reviewer pass — requirement-level judgment only
// ---------------------------------------------------------------------------

const reviewOutputSchema = z.object({
  issues: z.array(
    consistencyIssueSchema.extend({
      code: z.enum(["requirement_contradiction", "uncovered_requirement"]),
    }),
  ),
});

const REVIEW_SYSTEM = `You are the Reviewer agent for Mullion, running the pre-confirmation consistency check on a planned architecture. You are NOT reviewing code — only whether the graph is consistent with the Requirements Document.

Report ONLY genuine blockers:
- "requirement_contradiction": the graph does something the requirements forbid, or two parts of the graph cannot both be true.
- "uncovered_requirement": a functional requirement in scope.inV1 that no component or task addresses.
Do not report style opinions, missing nice-to-haves, or anything about scope.outOfV1. An empty issues list is the expected result for a sound plan.

Respond with STRICT JSON only, no markdown fences: {"issues": [{"code": "requirement_contradiction" | "uncovered_requirement", "message": string, "nodeKeys": [string]}]}`;

export interface ConsistencyReviewInput {
  requirements: RequirementsDoc;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const consistencyReviewAgent: AgentSpec<ConsistencyReviewInput, ConsistencyIssue[]> = {
  role: "reviewer",
  temperature: 0,
  maxTokens: 2_000,
  buildMessages(input: ConsistencyReviewInput): ChatMessage[] {
    const graph = {
      nodes: input.nodes
        .filter((n) => n.status === "active")
        .map((n) => ({
          nodeKey: n.nodeKey,
          kind: n.kind,
          label: n.label,
          description: n.description,
          ...(n.acceptanceCriteria ? { acceptanceCriteria: n.acceptanceCriteria } : {}),
          ...(n.dependsOn.length > 0 ? { dependsOn: n.dependsOn } : {}),
        })),
      edges: input.edges
        .filter((e) => e.status === "active")
        .map((e) => ({ sourceKey: e.sourceKey, targetKey: e.targetKey, label: e.label })),
    };
    return [
      { role: "system", content: REVIEW_SYSTEM },
      {
        role: "user",
        content: `Requirements Document:\n${JSON.stringify(input.requirements)}\n\nArchitecture graph:\n${JSON.stringify(graph)}`,
      },
    ];
  },
  parse(content: string): ConsistencyIssue[] {
    return parseJsonWith(reviewOutputSchema, content).issues;
  },
};
