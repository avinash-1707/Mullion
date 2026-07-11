import { and, desc, eq, notInArray } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { schema } from "@mullion/db";
import { createBuildBodySchema, escalationDecisionBodySchema, type BuildRun } from "@mullion/schemas";
import { escalationSignal, startBuildRun, workflowIdForRun, type EscalationDecision } from "@mullion/orchestrator";
import { db } from "../db.js";
import { requireOrgMember, type RequiredAuthVariables } from "../middleware/session.js";
import { getTemporalClient } from "../temporal.js";
import { streamEvents } from "../sse.js";

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
  .get("/:id", async (c) => c.json(toApiShape(await loadRun(c))))
  .get("/:id/stream", async (c) => {
    const run = await loadRun(c);
    const organizationId = c.get("organizationId");
    return streamEvents(c, {
      db,
      streamId: run.id,
      organizationId,
      userId: c.get("user").id,
      assertAccess: async () => {
        const [row] = await db
          .select({ id: schema.runs.id })
          .from(schema.runs)
          .where(and(eq(schema.runs.id, run.id), eq(schema.runs.organizationId, organizationId)))
          .limit(1);
        return Boolean(row);
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

    let client;
    try {
      client = await getTemporalClient();
      await client.workflow.getHandle(workflowIdForRun(run.id)).signal(escalationSignal, decision);
    } catch (error) {
      // Workflow already closed / not found → the gate isn't live.
      throw new HTTPException(409, {
        message: "Build is not awaiting an escalation decision",
        cause: error,
      });
    }
    return c.json({ ok: true });
  });
