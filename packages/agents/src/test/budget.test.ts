import { describe, expect, it, vi } from "vitest";
import type { Db } from "@mullion/db";
import { BudgetExceededError, assertBudget, checkBudget } from "../budget.js";

// Budget queries are exercised against a fake db that returns scripted SUMs
// per call, in call order (run-sum first when a runId is checked, then
// org-window-sum).

function fakeDb(sums: number[]): Db {
  let i = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ total: String(sums[i++] ?? 0) }]),
      }),
    }),
  } as unknown as Db;
}

const config = { runBudgetUsd: 1, orgBudgetUsd: 10, orgWindowHours: 24 };

describe("checkBudget", () => {
  it("passes when both scopes are under budget", async () => {
    const status = await checkBudget(fakeDb([0.5, 5]), {
      organizationId: "org-1",
      runId: "run-1",
      config,
    });
    expect(status.ok).toBe(true);
  });

  it("trips the run ceiling first", async () => {
    const status = await checkBudget(fakeDb([1.2, 0]), {
      organizationId: "org-1",
      runId: "run-1",
      config,
    });
    expect(status).toMatchObject({ ok: false, scope: "run" });
  });

  it("counts live-accrued sandbox cost that is not yet persisted (no under-count)", async () => {
    // Persisted run cost 0.6, live sandbox accrual 0.5 → 1.1 ≥ 1 run cap.
    const status = await checkBudget(fakeDb([0.6, 0]), {
      organizationId: "org-1",
      runId: "run-1",
      liveAccruedUsd: 0.5,
      config,
    });
    expect(status).toMatchObject({ ok: false, scope: "run" });
  });

  it("trips the org window ceiling when the run is fine", async () => {
    const status = await checkBudget(fakeDb([0.1, 12]), {
      organizationId: "org-1",
      runId: "run-1",
      config,
    });
    expect(status).toMatchObject({ ok: false, scope: "org" });
  });

  it("skips the run check when no runId is given", async () => {
    const status = await checkBudget(fakeDb([3]), { organizationId: "org-1", config });
    expect(status.ok).toBe(true); // 3 < 10 org, run check skipped entirely
  });

  it("trips exactly at the ceiling (>= boundary, both scopes)", async () => {
    // run-sum == run cap → trips.
    const runAt = await checkBudget(fakeDb([1, 0]), {
      organizationId: "org-1",
      runId: "run-1",
      config,
    });
    expect(runAt).toMatchObject({ ok: false, scope: "run" });
    // org-window-sum == org cap → trips (run under).
    const orgAt = await checkBudget(fakeDb([0, 10]), {
      organizationId: "org-1",
      runId: "run-1",
      config,
    });
    expect(orgAt).toMatchObject({ ok: false, scope: "org" });
  });

  it("assertBudget throws BudgetExceededError on a trip", async () => {
    await expect(
      assertBudget(fakeDb([2, 0]), { organizationId: "org-1", runId: "run-1", config }),
    ).rejects.toBeInstanceOf(BudgetExceededError);
  });
});
