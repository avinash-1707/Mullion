import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { createDb, schema, type Db } from "@mullion/db";
import type { SandboxDriver } from "@mullion/sandbox";
import type { ToolCallingLlm } from "@mullion/agents";
import { createActivities } from "./activities.js";
import type { TaskGraphNode } from "./policy.js";

/**
 * The ADR-52 crux, against real Postgres: ensureTaskRowActivity must be
 * idempotent — a Temporal retry of the activity must return the SAME
 * taskRowId, not INSERT a duplicate. Proves the partial unique index
 * `(run_id, spec_task_id) WHERE spec_task_id IS NOT NULL` + ON CONFLICT DO
 * NOTHING actually collide. Gated on DATABASE_URL (needs a running Postgres).
 */

const dbUrl = process.env["DATABASE_URL"];
const ORG = "org-ensuretest";
const USER = "user-ensuretest";
// Fixed ids so the reusable fixtures (org/user/session/spec) survive across
// runs — build_specs is immutable-by-trigger and can't be deleted, so we
// seed it once (onConflictDoNothing) and only clean the runs/tasks.
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SPEC_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function deps(db: Db) {
  return {
    db,
    llm: {} as ToolCallingLlm,
    driver: {} as SandboxDriver,
    sandboxCostPerSec: 0.0001,
  };
}

let db: Db;
let pool: { end: () => Promise<void> };
let runId: string;

describe.skipIf(!dbUrl)("ensureTaskRowActivity idempotency (real Postgres)", () => {
  beforeAll(async () => {
    ({ db, pool } = createDb(dbUrl!));
    // Reusable fixtures (org → user → session → build_spec), idempotent.
    await db.insert(schema.organization).values({ id: ORG, name: "T", slug: "ensuretest" }).onConflictDoNothing();
    await db
      .insert(schema.user)
      .values({ id: USER, name: "T", email: "ensure@test.local" })
      .onConflictDoNothing();
    // Build id reuses SESSION_ID (same trick as the 0012 backfill) — the
    // fixture chain stays two constants, not three.
    await db
      .insert(schema.builds)
      .values({ id: SESSION_ID, organizationId: ORG, userId: USER, idea: "test" })
      .onConflictDoNothing();
    await db
      .insert(schema.planningSessions)
      .values({
        id: SESSION_ID,
        organizationId: ORG,
        userId: USER,
        buildId: SESSION_ID,
        idea: "test",
        status: "confirmed",
      })
      .onConflictDoNothing();
    await db
      .insert(schema.buildSpecs)
      .values({
        id: SPEC_ID,
        organizationId: ORG,
        sessionId: SESSION_ID,
        contentHash: "sha256:ensuretest",
        spec: { task_graph: [] },
      })
      .onConflictDoNothing();
    // Clear any run left by a prior run of this test (frees the ADR-29 slot).
    await db.delete(schema.tasks).where(eq(schema.tasks.organizationId, ORG));
    await db.delete(schema.runs).where(eq(schema.runs.organizationId, ORG));
    const [run] = await db
      .insert(schema.runs)
      .values({ organizationId: ORG, userId: USER, buildId: SESSION_ID, buildSpecId: SPEC_ID, status: "building" })
      .returning();
    runId = run!.id;
  }, 30_000);

  afterAll(async () => {
    if (!db) return;
    // Clean only the mutable rows; build_specs is immutable-by-trigger and
    // its fixture chain is intentionally left for reuse.
    await db.delete(schema.tasks).where(eq(schema.tasks.organizationId, ORG));
    await db.delete(schema.runs).where(eq(schema.runs.organizationId, ORG));
    await pool.end();
  });

  const node: TaskGraphNode = {
    task_id: "spec-task-1",
    description: "do the thing",
    acceptance_criteria: "it works",
    depends_on: [],
  };

  it("returns the same taskRowId on a repeated call (no duplicate row)", async () => {
    const acts = createActivities(deps(db));
    const first = await acts.ensureTaskRowActivity({ runId, organizationId: ORG, node, verifyCommand: "node --test" });
    const second = await acts.ensureTaskRowActivity({ runId, organizationId: ORG, node, verifyCommand: "node --test" });
    expect(second.taskRowId).toBe(first.taskRowId);

    const rows = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.runId, runId), eq(schema.tasks.specTaskId, "spec-task-1")));
    expect(rows).toHaveLength(1); // exactly one row despite two calls
  });

  it("creates distinct rows for distinct spec_task_ids", async () => {
    const acts = createActivities(deps(db));
    const a = await acts.ensureTaskRowActivity({
      runId,
      organizationId: ORG,
      node: { ...node, task_id: "spec-task-A" },
      verifyCommand: "node --test",
    });
    const b = await acts.ensureTaskRowActivity({
      runId,
      organizationId: ORG,
      node: { ...node, task_id: "spec-task-B" },
      verifyCommand: "node --test",
    });
    expect(a.taskRowId).not.toBe(b.taskRowId);
  });

  it("the partial index does not constrain null spec_task_id rows", async () => {
    // Two tasks with NULL spec_task_id under the same run must both insert
    // (the unique index is WHERE spec_task_id IS NOT NULL).
    await db.insert(schema.tasks).values([
      { organizationId: ORG, runId, description: "null-a" },
      { organizationId: ORG, runId, description: "null-b" },
    ]);
    const nulls = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.runId, runId), sql`${schema.tasks.specTaskId} IS NULL`));
    expect(nulls.length).toBeGreaterThanOrEqual(2);
  });
});
