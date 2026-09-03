import { describe, expect, it } from "vitest";
import { topoSort } from "@mullion/orchestrator";
import { buildSpecArtifactSchema } from "@mullion/schemas";
import { parseToolCall } from "@mullion/agents";
import { EVAL_TASKS } from "../tasks.js";

/**
 * The suite is FIXED (ADR-12) — these tests freeze its shape so an
 * accidental edit (renamed id, dropped task, broken graph) fails CI before
 * it corrupts the trend line.
 */
describe("fixed eval suite (ADR-12)", () => {
  it("has exactly 16 tasks with unique ids and a difficulty ramp", () => {
    expect(EVAL_TASKS).toHaveLength(16);
    expect(new Set(EVAL_TASKS.map((t) => t.id)).size).toBe(16);
    expect(EVAL_TASKS.some((t) => t.difficulty === 1)).toBe(true);
    expect(EVAL_TASKS.some((t) => t.difficulty === 5)).toBe(true);
  });

  it("every task graph is acyclic and references only its own nodes", () => {
    for (const task of EVAL_TASKS) {
      const ids = new Set(task.nodes.map((n) => n.taskId));
      for (const node of task.nodes) {
        for (const dep of node.dependsOn) expect(ids.has(dep), `${task.id}:${dep}`).toBe(true);
      }
      expect(() =>
        topoSort(
          task.nodes.map((n) => ({
            task_id: n.taskId,
            description: n.description,
            acceptance_criteria: n.acceptanceCriteria,
            depends_on: n.dependsOn,
          })),
        ),
      ).not.toThrow();
    }
  });

  it("every task freezes into a valid Build Spec artifact shape", () => {
    for (const task of EVAL_TASKS) {
      const artifact = {
        build_spec_id: "00000000-0000-4000-8000-000000000000",
        content_hash: `sha256:eval-${task.id}`,
        requirements: { idea: task.idea },
        architecture_graph: { nodes: [], edges: [] },
        task_graph: task.nodes.map((n) => ({
          task_id: n.taskId,
          description: n.description,
          acceptance_criteria: n.acceptanceCriteria,
          depends_on: n.dependsOn,
        })),
        decision_log_ids: [],
        frozen_at: new Date().toISOString(),
      };
      expect(() => buildSpecArtifactSchema.parse(artifact), task.id).not.toThrow();
    }
  });

  it("every scripted transcript's tool calls parse against the coder tool schemas", () => {
    for (const task of EVAL_TASKS) {
      for (const node of task.nodes) {
        for (const attempt of node.scriptedAttempts) {
          for (const turn of attempt) {
            for (const call of turn.toolCalls ?? []) {
              const parsed = parseToolCall(call.function.name, call.function.arguments);
              expect(parsed.ok, `${task.id}/${node.taskId}/${call.id}`).toBe(true);
            }
          }
        }
      }
    }
  });

  it("every non-error transcript ends by submitting", () => {
    for (const task of EVAL_TASKS) {
      for (const node of task.nodes) {
        for (const attempt of node.scriptedAttempts) {
          const hasError = attempt.some((turn) => turn.error);
          if (hasError) continue;
          const last = attempt[attempt.length - 1];
          const names = (last?.toolCalls ?? []).map((c) => c.function.name);
          expect(names, `${task.id}/${node.taskId}`).toContain("submit");
        }
      }
    }
  });
});
