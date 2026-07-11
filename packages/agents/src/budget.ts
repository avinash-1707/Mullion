import { and, eq, sql } from "drizzle-orm";
import { schema, type Db } from "@mullion/db";

/**
 * ADR-31 combined LLM+sandbox budget circuit breaker. Supersedes ADR-43's
 * stopgap (which was per-org LLM only): the same function now backs both the
 * planning-phase org check and the build-phase per-run + per-org checks, so
 * there is one breaker, not two drifting ones.
 *
 * Two scopes:
 * - per-run: SUM(cost_events WHERE run_id) PLUS the caller's live-accrued
 *   sandbox cost for the in-flight task. Sandbox cost is persisted
 *   best-effort (it can lag or be dropped on a crash), so counting only
 *   persisted rows would under-count and let a run overrun. Adding the live
 *   accrual makes the check err toward over-counting — the safe direction
 *   for a ceiling.
 * - per-org: SUM(cost_events WHERE org) over a rolling window.
 */

export interface BudgetConfig {
  /** Per-run ceiling; undefined disables the run check. */
  runBudgetUsd?: number | undefined;
  /** Per-org rolling-window ceiling. */
  orgBudgetUsd: number;
  /** Rolling window for the org ceiling. Default 24h. */
  orgWindowHours?: number | undefined;
}

export interface BudgetCheckArgs {
  organizationId: string;
  runId?: string | undefined;
  /** Cost accrued this task but not yet in cost_events (e.g. live sandbox time). */
  liveAccruedUsd?: number | undefined;
  config: BudgetConfig;
}

export type BudgetScope = "run" | "org";

export interface BudgetStatus {
  ok: boolean;
  /** Which ceiling tripped, when !ok. */
  scope?: BudgetScope;
  spentUsd: number;
  limitUsd?: number;
}

export class BudgetExceededError extends Error {
  readonly scope: BudgetScope;
  readonly spentUsd: number;
  readonly limitUsd: number;

  constructor(scope: BudgetScope, spentUsd: number, limitUsd: number) {
    super(`${scope} budget exceeded: $${spentUsd.toFixed(4)} >= $${limitUsd.toFixed(4)}`);
    this.name = "BudgetExceededError";
    this.scope = scope;
    this.spentUsd = spentUsd;
    this.limitUsd = limitUsd;
  }
}

async function sumForRun(db: Db, runId: string, organizationId: string): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${schema.costEvents.cost}), 0)` })
    .from(schema.costEvents)
    .where(
      and(
        eq(schema.costEvents.runId, runId),
        // Org-scoped like every tenant query (CLAUDE.md non-negotiable),
        // even though run_id is already a globally-unique PK.
        eq(schema.costEvents.organizationId, organizationId),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

async function sumForOrgWindow(db: Db, organizationId: string, windowHours: number): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`coalesce(sum(${schema.costEvents.cost}), 0)` })
    .from(schema.costEvents)
    .where(
      and(
        eq(schema.costEvents.organizationId, organizationId),
        sql`${schema.costEvents.createdAt} >= now() - make_interval(hours => ${windowHours})`,
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

/** Returns the budget status without throwing — callers decide how to react. */
export async function checkBudget(db: Db, args: BudgetCheckArgs): Promise<BudgetStatus> {
  const live = args.liveAccruedUsd ?? 0;

  if (args.runId !== undefined && args.config.runBudgetUsd !== undefined) {
    const runSpent = (await sumForRun(db, args.runId, args.organizationId)) + live;
    if (runSpent >= args.config.runBudgetUsd) {
      return { ok: false, scope: "run", spentUsd: runSpent, limitUsd: args.config.runBudgetUsd };
    }
  }

  const windowHours = args.config.orgWindowHours ?? 24;
  const orgSpent = (await sumForOrgWindow(db, args.organizationId, windowHours)) + live;
  if (orgSpent >= args.config.orgBudgetUsd) {
    return { ok: false, scope: "org", spentUsd: orgSpent, limitUsd: args.config.orgBudgetUsd };
  }

  return { ok: true, spentUsd: orgSpent };
}

/** Throwing variant for use inside the build loop. */
export async function assertBudget(db: Db, args: BudgetCheckArgs): Promise<void> {
  const status = await checkBudget(db, args);
  if (!status.ok) {
    throw new BudgetExceededError(status.scope!, status.spentUsd, status.limitUsd!);
  }
}
