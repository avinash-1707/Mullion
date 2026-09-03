import { describe, expect, it } from "vitest";
import { aggregate, type EvalTaskOutcome } from "../metrics.js";
import { parseHistory, renderTrend } from "../trend.js";

const outcome = (over: Partial<EvalTaskOutcome>): EvalTaskOutcome => ({
  taskId: "e01",
  title: "t",
  difficulty: 1,
  status: "verified",
  expected: "verified",
  matchedExpectation: true,
  nodes: [
    {
      taskId: "t1",
      status: "verified",
      attempts: 1,
      turns: 2,
      costUsd: 0.01,
      durationMs: 100,
      escalated: false,
    },
  ],
  costUsd: 0.01,
  durationMs: 100,
  ...over,
});

describe("aggregate (ADR-12 metrics)", () => {
  it("computes pass rate, retries, escalations, and cost per task", () => {
    const tasks = [
      outcome({}),
      outcome({
        taskId: "e02",
        status: "failed",
        matchedExpectation: false,
        costUsd: 0.05,
        nodes: [
          {
            taskId: "t1",
            status: "failed",
            attempts: 3,
            turns: 6,
            costUsd: 0.05,
            durationMs: 500,
            failureReason: "test_failed",
            escalated: true,
          },
        ],
      }),
    ];
    const agg = aggregate(tasks);
    expect(agg.tasksTotal).toBe(2);
    expect(agg.tasksPassed).toBe(1);
    expect(agg.passRate).toBe(0.5);
    expect(agg.retries).toBe(2); // 3 attempts = 2 retries
    expect(agg.escalations).toBe(1);
    expect(agg.totalCostUsd).toBeCloseTo(0.06);
    expect(agg.avgCostPerTaskUsd).toBeCloseTo(0.03);
    expect(agg.totalTurns).toBe(8);
  });

  it("handles the empty set without dividing by zero", () => {
    const agg = aggregate([]);
    expect(agg.passRate).toBe(0);
    expect(agg.avgCostPerTaskUsd).toBe(0);
  });
});

describe("trend rendering", () => {
  it("renders one row per record with same-mode deltas", () => {
    const record = (version: string, passed: number): string =>
      JSON.stringify({
        version,
        timestamp: "2026-07-11T00:00:00.000Z",
        mode: "scripted",
        aggregate: {
          tasksTotal: 16,
          tasksPassed: passed,
          passRate: passed / 16,
          retries: 1,
          escalations: 1,
          totalCostUsd: 0.5,
          avgCostPerTaskUsd: 0.03125,
          totalTurns: 40,
        },
      });
    const records = parseHistory([record("aaa1111", 14), record("bbb2222", 15)].join("\n"));
    const md = renderTrend(records);
    expect(md).toContain("| aaa1111 |");
    expect(md).toContain("| bbb2222 |");
    // Second row carries a delta against the first.
    expect(md).toContain("(+6.3)");
  });

  it("renders an empty-state row when no history exists", () => {
    expect(renderTrend([])).toContain("no recorded runs yet");
  });
});
