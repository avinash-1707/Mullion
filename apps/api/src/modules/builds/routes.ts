import { and, desc, eq, notInArray } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { schema } from "@mullion/db";
import {
  createBuildBodySchema,
  escalationDecisionBodySchema,
  type BuildRun,
  type BuildTask,
} from "@mullion/schemas";
import { z } from "zod";
import { escalationSignal, startBuildRun, workflowIdForRun, type EscalationDecision } from "@mullion/orchestrator";
import { db } from "../../lib/db.js";
import { requireOrgMember, type RequiredAuthVariables } from "../../middleware/session.js";
import { getTemporalClient } from "../../lib/temporal.js";
import { streamEvents } from "../../lib/sse.js";

type RunRow = typeof schema.runs.$inferSelect;
type RouteContext = Context<{ Variables: RequiredAuthVariables }>;

function toApiShape(row: RunRow): BuildRun {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    buildSpecId: row.buildSpecId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === "23505" && candidate.constraint === constraint) return true;
    current = candidate.cause;
  }
  return false;
}

async function loadRun(c: RouteContext): Promise<RunRow> {
  const organizationId = c.get("organizationId");
  const id = c.req.param("id");
  if (!id) throw new HTTPException(404, { message: "Build not found" });
  const [row] = await db
    .select()
    .from(schema.runs)
    .where(and(eq(schema.runs.id, id), eq(schema.runs.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new HTTPException(404, { message: "Build not found" });
  return row;
}

/**
 * Fork B entry (M3, 02 §3). POST inserts the run row FIRST — claiming
 * ADR-29's one-active-build-per-user slot at the DB layer — then starts the
 * Temporal workflow. GET /:id/stream reuses the planning SSE infra over the
 * run's stream_events (coarse phase/task feed; the rich per-turn transcript
 * is M5).
 */
export const buildsRoute = new Hono<{ Variables: RequiredAuthVariables }>()
  .use(requireOrgMember)
  .post("/", zValidator("json", createBuildBodySchema), async (c) => {
    const user = c.get("user");
    const organizationId = c.get("organizationId");
    const { buildSpecId } = c.req.valid("json");

    // The Build Spec must exist in this org (ADR-36).
    const [spec] = await db
      .select({ id: schema.buildSpecs.id })
      .from(schema.buildSpecs)
      .where(
        and(
          eq(schema.buildSpecs.id, buildSpecId),
          eq(schema.buildSpecs.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!spec) throw new HTTPException(404, { message: "Build Spec not found" });

    let run: RunRow;
    try {
      const inserted = await db
        .insert(schema.runs)
        .values({ organizationId, userId: user.id, buildSpecId, status: "queued" })
        .returning();
      if (!inserted[0]) throw new Error("run insert returned nothing");
      run = inserted[0];
    } catch (error) {
      // ADR-29: one ACTIVE build per user — the partial unique index is
      // per-user ACROSS orgs (ADR-36). Look up the user's active
      // (non-terminal) run keyed on userId alone, matching the index.
      if (isUniqueViolation(error, "runs_one_active_per_user")) {
        const [active] = await db
          .select()
          .from(schema.runs)
          .where(
            and(
              eq(schema.runs.userId, user.id),
              notInArray(schema.runs.status, ["done", "failed"]),
            ),
          )
          .orderBy(desc(schema.runs.createdAt))
          .limit(1);
        // Same org → hand back the active run so the client tracks it.
        if (active && active.organizationId === organizationId) {
          return c.json(toApiShape(active), 200);
        }
        // Active run in a DIFFERENT org → 409 without leaking its id.
        throw new HTTPException(409, {
          message: "You already have an active build running — finish or abandon it first",
        });
      }
      throw error;
    }

    // Connect FIRST: a connection failure means the workflow definitively did
    // not start, so it is safe to fail the run and free the slot.
    let client;
    try {
      client = await getTemporalClient();
    } catch (error) {
      await db.update(schema.runs).set({ status: "failed" }).where(eq(schema.runs.id, run.id));
      throw new HTTPException(503, {
        message: "Build orchestrator is unavailable — the run was not started",
        cause: error,
      });
    }

    try {
      await startBuildRun(client, { runId: run.id, buildSpecId, organizationId, userId: user.id });
    } catch {
      // Ambiguous: the start RPC may have durably persisted server-side even
      // though the ack was lost. Do NOT fabricate a 'failed' state (that could
      // free the slot and let a second workflow start for a run that IS
      // executing). Leave the run 'queued' and return 202 so the client polls;
      // if the workflow really didn't start, the run stays queued and can be
      // reconciled later.
      return c.json(toApiShape(run), 202);
    }

    return c.json(toApiShape(run), 201);
  })
  // Dashboard entry: the org's recent runs, newest first (02 §7.1).
  .get("/", async (c) => {
    const organizationId = c.get("organizationId");
    const rows = await db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.organizationId, organizationId))
      .orderBy(desc(schema.runs.createdAt))
      .limit(20);
    return c.json(rows.map(toApiShape));
  })
  .get("/:id", async (c) => c.json(toApiShape(await loadRun(c))))
  // Task rows for the timeline — statuses update live via the run stream;
  // this endpoint is the snapshot a page load starts from.
  .get("/:id/tasks", async (c) => {
    const run = await loadRun(c);
    const rows = await db
      .select()
      .from(schema.tasks)
      .where(
        and(eq(schema.tasks.runId, run.id), eq(schema.tasks.organizationId, run.organizationId)),
      )
      .orderBy(schema.tasks.createdAt);
    const dependsOn = z.array(z.string());
    const tasks: BuildTask[] = rows.map((row) => ({
      id: row.id,
      specTaskId: row.specTaskId,
      description: row.description,
      status: row.status,
      attempt: row.attempt,
      dependsOn: dependsOn.catch([]).parse(row.dependsOn),
      result: row.result ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
    return c.json(tasks);
  })
  .get("/:id/stream", async (c) => {
    const run = await loadRun(c);
    const organizationId = c.get("organizationId");
    const userId = c.get("user").id;
    return streamEvents(c, {
      db,
      streamId: run.id,
      organizationId,
      userId,
      // Re-prove MEMBERSHIP, not run existence — a revoked member must stop
      // receiving the feed within a minute, matching the planning stream
      // (Phase 3 audit M1: the run always exists, so checking it was a
      // recheck that could never fail).
      assertAccess: async () => {
        const membership = await db
          .select({ id: schema.member.id })
          .from(schema.member)
          .where(
            and(eq(schema.member.userId, userId), eq(schema.member.organizationId, organizationId)),
          )
          .limit(1);
        return membership.length > 0;
      },
    });
  })
  // ADR-55/07: the human escalation gate. A mutating signal, so it is
  // OWNER-only (not just org member — the redirect is per-user free-text
  // fed to the Coder), state-guarded (only a non-terminal run), and the
  // redirect body is zod-capped (injection/cost guard, ADR-02).
  .post("/:id/escalate", zValidator("json", escalationDecisionBodySchema), async (c) => {
    const run = await loadRun(c);
    if (run.userId !== c.get("user").id) {
      throw new HTTPException(403, { message: "Only the build owner can escalate" });
    }
    if (run.status === "done" || run.status === "failed") {
      throw new HTTPException(409, { message: `Build is ${run.status}, not awaiting escalation` });
    }
    const body = c.req.valid("json");
    const decision: EscalationDecision =
      "redirect" in body ? { redirect: body.redirect } : body.decision;

    // The decision must target a real task of THIS run — reject a stray
    // specTaskId before signalling (Phase 3 audit: decisions are routed by
    // task, so a garbage id would just sit unconsumed in the workflow).
    const [task] = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.runId, run.id),
          eq(schema.tasks.organizationId, run.organizationId),
          eq(schema.tasks.specTaskId, body.specTaskId),
        ),
      )
      .limit(1);
    if (!task) {
      throw new HTTPException(404, { message: "No such task in this build" });
    }

    let client;
    try {
      client = await getTemporalClient();
      await client.workflow
        .getHandle(workflowIdForRun(run.id))
        .signal(escalationSignal, { specTaskId: body.specTaskId, decision });
    } catch (error) {
      // Workflow already closed / not found → the gate isn't live.
      throw new HTTPException(409, {
        message: "Build is not awaiting an escalation decision",
        cause: error,
      });
    }
    return c.json({ ok: true });
  });
