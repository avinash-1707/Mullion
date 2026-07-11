import type { TaskFailureReason } from "@mullion/schemas";

/**
 * Pure orchestration policy (ADR-50/51). Extracted from the workflow so it is
 * unit-testable with NO Temporal server binary — the workflow just calls
 * these. All deterministic, side-effect-free, safe inside the workflow
 * isolate.
 */

/** How many workflow-level attempts a task gets before it escalates (02 §3.1). */
export const RETRY_BUDGET = 3;

/** The task-queue every build worker and client agree on. */
export const BUILD_TASK_QUEUE = "mullion-build";

export interface TaskGraphNode {
  task_id: string;
  description: string;
  acceptance_criteria: string;
  depends_on: string[];
}

/**
 * Kahn topological sort. Deterministic (stable input order preserved) so it
 * is replay-safe in the workflow. Throws on a cycle or a dangling
 * dependency — both mean the frozen task_graph is unbuildable.
 */
export function topoSort(nodes: TaskGraphNode[]): TaskGraphNode[] {
  const byId = new Map(nodes.map((n) => [n.task_id, n]));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const node of nodes) {
    indegree.set(node.task_id, node.depends_on.length);
    for (const dep of node.depends_on) {
      if (!byId.has(dep)) {
        throw new Error(`task "${node.task_id}" depends on unknown task "${dep}"`);
      }
      const list = dependents.get(dep) ?? [];
      list.push(node.task_id);
      dependents.set(dep, list);
    }
  }

  // Seed the ready set in the graph's declared order for determinism.
  const ready = nodes.filter((n) => (indegree.get(n.task_id) ?? 0) === 0).map((n) => n.task_id);
  const order: TaskGraphNode[] = [];

  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(byId.get(id)!);
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }

  if (order.length !== nodes.length) {
    throw new Error("task_graph has a dependency cycle");
  }
  return order;
}

export type Disposition = "retry" | "terminal";

/**
 * Whether a returned TaskResult failure reason is worth another attempt
 * within the retry budget, or is terminal for the whole run (ADR-51).
 * `budget_exceeded` is the only terminal one — retrying spends more against
 * a ceiling already hit. Everything else may improve on a fresh attempt and
 * is bounded by RETRY_BUDGET.
 */
export function dispositionFor(reason: TaskFailureReason): Disposition {
  return reason === "budget_exceeded" ? "terminal" : "retry";
}
