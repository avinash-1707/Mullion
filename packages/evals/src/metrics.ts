import type { TaskFailureReason } from "@mullion/schemas";

/**
 * The four ADR-12 metrics, per task and aggregated per system version:
 * pass rate, retry count, escalation frequency, cost per task.
 */

export interface NodeOutcome {
  taskId: string;
  status: "verified" | "failed";
  /** Attempts consumed (1 = first try passed). */
  attempts: number;
  /** LLM turns across all attempts. */
  turns: number;
  costUsd: number;
  durationMs: number;
  failureReason?: TaskFailureReason | undefined;
  /** True when the node exhausted its retry budget or failed terminally —
   * the condition that opens an ADR-55 escalation gate in a real run. */
  escalated: boolean;
}

export interface EvalTaskOutcome {
  taskId: string;
  title: string;
  difficulty: number;
  status: "verified" | "failed";
  expected: "verified" | "failed";
  matchedExpectation: boolean;
  nodes: NodeOutcome[];
  costUsd: number;
  durationMs: number;
}

export interface EvalAggregate {
  tasksTotal: number;
  tasksPassed: number;
  passRate: number;
  /** Extra attempts beyond the first, summed over all nodes. */
  retries: number;
  escalations: number;
  totalCostUsd: number;
  avgCostPerTaskUsd: number;
  totalTurns: number;
}

export interface EvalRunRecord {
  /** System version — git SHA (short) the suite ran against. */
  version: string;
  timestamp: string;
  mode: "scripted" | "live" | "replay";
  aggregate: EvalAggregate;
  tasks: EvalTaskOutcome[];
}

export function aggregate(tasks: EvalTaskOutcome[]): EvalAggregate {
  const nodes = tasks.flatMap((t) => t.nodes);
  const passed = tasks.filter((t) => t.status === "verified").length;
  const totalCostUsd = tasks.reduce((s, t) => s + t.costUsd, 0);
  return {
    tasksTotal: tasks.length,
    tasksPassed: passed,
    passRate: tasks.length === 0 ? 0 : passed / tasks.length,
    retries: nodes.reduce((s, n) => s + Math.max(0, n.attempts - 1), 0),
    escalations: nodes.filter((n) => n.escalated).length,
    totalCostUsd,
    avgCostPerTaskUsd: tasks.length === 0 ? 0 : totalCostUsd / tasks.length,
    totalTurns: nodes.reduce((s, n) => s + n.turns, 0),
  };
}
