import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { schema } from "@mullion/db";
import {
  consistencyResultSchema,
  createPlanningSessionBodySchema,
  editPromptBodySchema,
  mcqQuestionSchema,
  submitAnswersBodySchema,
  type PlanningSession,
} from "@mullion/schemas";
import { z } from "zod";
import { db } from "../../lib/db.js";
import { requireOrgMember, type RequiredAuthVariables } from "../../middleware/session.js";
import { publishPlanningEvent, parseAgentTask, type SessionRow } from "./state.js";
import { isOrgBudgetExhausted, runClaimedTask, startAgentTask } from "./flows.js";
import { ConfirmBlockedError, confirmAndFreeze } from "./confirm.js";
import { getSnapshot } from "./snapshot.js";
import { buildExportBundle } from "./export.js";
import { streamEvents } from "../../lib/sse.js";

function toApiShape(row: SessionRow): PlanningSession {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    status: row.status,
    phase: row.phase,
    agentState: row.agentState,
    idea: row.idea,
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  // Drizzle wraps the pg DatabaseError (code/constraint live on a cause).
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (candidate.code === "23505" && candidate.constraint === constraint) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

type RouteContext = Context<{ Variables: RequiredAuthVariables }>;

/**
 * Loads the session org-scoped (ADR-36: a foreign-org id behaves like a
 * missing row). `mustBeCreator` gates every mutating action — org members
 * view, only the creator edits/answers (01 §0 assumptions).
 */
async function loadSession(c: RouteContext, opts?: { mustBeCreator?: boolean }): Promise<SessionRow> {
  const organizationId = c.get("organizationId");
  const id = c.req.param("id");
  if (!id) {
    throw new HTTPException(404, { message: "Session not found" });
  }
  const [row] = await db
    .select()
    .from(schema.planningSessions)
    .where(
      and(
        eq(schema.planningSessions.id, id),
        eq(schema.planningSessions.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new HTTPException(404, { message: "Session not found" });
  }
  if (opts?.mustBeCreator && row.userId !== c.get("user").id) {
    throw new HTTPException(403, { message: "Only the session creator can do that" });
  }
  return row;
}

function requireActive(session: SessionRow): void {
  if (session.status !== "active") {
    throw new HTTPException(409, { message: `Session is ${session.status}, not active` });
  }
}

/** 409 when the agent slot is held; 429 when the org's daily budget is spent. */
async function startOrConflict(session: SessionRow, task: Parameters<typeof startAgentTask>[1]): Promise<void> {
  const result = await startAgentTask(session, task);
  if (result === "busy") {
    throw new HTTPException(409, { message: "An agent is already working on this session" });
  }
  if (result === "budget_exhausted") {
    // ADR-43: stopgap per-org daily ceiling until ADR-31's circuit breaker.
    throw new HTTPException(429, {
      message: "Your organization's daily planning budget is exhausted — try again later",
    });
  }
}

export const planningSessionsRoute = new Hono<{ Variables: RequiredAuthVariables }>()
  .use(requireOrgMember)

  .post("/", zValidator("json", createPlanningSessionBodySchema), async (c) => {
    const user = c.get("user");
    const organizationId = c.get("organizationId");
    const { idea } = c.req.valid("json");

    // ADR-43: don't create a session whose first Analyst call can't run.
    if (await isOrgBudgetExhausted(organizationId)) {
      throw new HTTPException(429, {
        message: "Your organization's daily planning budget is exhausted — try again later",
      });
    }

    // ADR-83: the build (lifecycle parent) and its session land in one
    // transaction — an ADR-29 unique violation on the session rolls the
    // build row back too, never leaving an orphan parent.
    const insertSession = async (): Promise<SessionRow | undefined> =>
      db.transaction(async (tx) => {
        const [build] = await tx
          .insert(schema.builds)
          .values({ organizationId, userId: user.id, idea })
          .returning({ id: schema.builds.id });
        if (!build) return undefined;
        const [created] = await tx
          .insert(schema.planningSessions)
          .values({ organizationId, userId: user.id, idea, buildId: build.id })
          .returning();
        return created;
      });

    const findActiveSession = async (): Promise<SessionRow | undefined> => {
      const [existing] = await db
        .select()
        .from(schema.planningSessions)
        .where(
          and(
            eq(schema.planningSessions.userId, user.id),
            eq(schema.planningSessions.status, "active"),
          ),
        )
        .limit(1);
      return existing;
    };

    // ADR-29 is per user across orgs — but only hand the session back when
    // it belongs to the org the caller is acting in; a mismatch would
    // confuse client state with a foreign-org object.
    const resolveConflict = async (): Promise<Response | null> => {
      const existing = await findActiveSession();
      if (existing && existing.organizationId === organizationId) {
        return c.json(toApiShape(existing), 200);
      }
      if (existing) {
        throw new HTTPException(409, {
          message: "An active session exists in another organization",
        });
      }
      return null;
    };

    try {
      const created = await insertSession();
      if (!created) {
        throw new HTTPException(500, { message: "Session insert returned no row" });
      }
      // Kick off Analyst round 1 immediately — the client lands on the
      // session page with the stream already producing (01 §2→§3).
      await startAgentTask(created, { kind: "question_round", round: 1 });
      return c.json(toApiShape(created), 201);
    } catch (error) {
      // ADR-29: the partial unique index is the enforcement; the API's job
      // is to hand back the existing active session, not a duplicate.
      if (isUniqueViolation(error, "planning_sessions_one_active_per_user")) {
        const resolved = await resolveConflict();
        if (resolved) return resolved;
        // The blocking session flipped out of 'active' between our INSERT
        // and the SELECT — the user is allowed to create one now; retry
        // once rather than surfacing the stale unique violation as a 500.
        // The retry maps its own races too: losing the slot AGAIN to a
        // concurrent create answers 200/409 like the first attempt, never
        // a raw 500.
        try {
          const retried = await insertSession();
          if (!retried) {
            throw new HTTPException(500, { message: "Session insert returned no row" });
          }
          await startAgentTask(retried, { kind: "question_round", round: 1 });
          return c.json(toApiShape(retried), 201);
        } catch (retryError) {
          if (retryError instanceof HTTPException) throw retryError;
          if (isUniqueViolation(retryError, "planning_sessions_one_active_per_user")) {
            const resolved = await resolveConflict();
            if (resolved) return resolved;
            throw new HTTPException(409, {
              message: "You already have an active session — resume or abandon it first",
            });
          }
          throw retryError;
        }
      }
      throw error;
    }
  })

  .get("/:id", async (c) => {
    const session = await loadSession(c);
    return c.json(toApiShape(session));
  })

  .get("/:id/snapshot", async (c) => {
    const session = await loadSession(c);
    return c.json(await getSnapshot(session));
  })

  .get("/:id/stream", async (c) => {
    const session = await loadSession(c);
    const userId = c.get("user").id;
    return streamEvents(c, {
      db,
      streamId: session.id,
      organizationId: session.organizationId,
      userId,
      // Revoked membership stops delivery within a minute, not at the
      // 30-min lifetime cap.
      assertAccess: async () => {
        const membership = await db
          .select({ id: schema.member.id })
          .from(schema.member)
          .where(
            and(
              eq(schema.member.userId, userId),
              eq(schema.member.organizationId, session.organizationId),
            ),
          )
          .limit(1);
        return membership.length > 0;
      },
    });
  })

  .post("/:id/answers", zValidator("json", submitAnswersBodySchema), async (c) => {
    const session = await loadSession(c, { mustBeCreator: true });
    requireActive(session);
    if (session.phase !== "requirements") {
      // Post-proceed changes go through Planner edit prompts, not answers.
      throw new HTTPException(409, { message: "Clarification answers are only accepted before architecture planning starts" });
    }
    const { roundId, answers } = c.req.valid("json");

    const [round] = await db
      .select()
      .from(schema.mcqRounds)
      .where(and(eq(schema.mcqRounds.id, roundId), eq(schema.mcqRounds.sessionId, session.id)))
      .limit(1);
    if (!round) {
      throw new HTTPException(404, { message: "Question round not found" });
    }
    const questions = z.array(mcqQuestionSchema).parse(round.questions);
    const questionIds = new Set(questions.map((q) => q.id));
    for (const answer of answers) {
      const question = questions.find((q) => q.id === answer.questionId);
      if (!question) {
        throw new HTTPException(400, { message: `Answer references unknown question ${answer.questionId}` });
      }
      for (const option of answer.selectedOptions) {
        if (!question.options.includes(option)) {
          throw new HTTPException(400, { message: `"${option}" is not an option of "${question.text}"` });
        }
      }
      if (question.type === "single_select" && answer.selectedOptions.length > 1) {
        throw new HTTPException(400, { message: `"${question.text}" is single-select` });
      }
    }
    const answeredIds = new Set(answers.map((a) => a.questionId));
    if (answeredIds.size !== questionIds.size || answers.length !== questions.length) {
      throw new HTTPException(400, { message: "Every question in the round must be answered exactly once" });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.mcqRounds)
        .set({ answers, answeredAt: new Date() })
        .where(eq(schema.mcqRounds.id, round.id));
      await publishPlanningEvent(tx, session, { type: "answers_recorded", roundId: round.id });
    });

    // Round 1 answered → the Analyst decides whether round 2 is needed
    // (empty round 2 falls through to the Requirements Document). Round 2
    // answered → straight to the doc. Re-answering regenerates downstream.
    await startOrConflict(
      session,
      round.round === 1 ? { kind: "question_round", round: 2 } : { kind: "requirements_doc" },
    );
    return c.json({ ok: true }, 202);
  })

  .post("/:id/proceed", async (c) => {
    const session = await loadSession(c, { mustBeCreator: true });
    requireActive(session);
    if (session.phase !== "requirements") {
      throw new HTTPException(409, { message: "Session is already past requirements" });
    }
    const [doc] = await db
      .select({ id: schema.requirementsDocs.id })
      .from(schema.requirementsDocs)
      .where(eq(schema.requirementsDocs.sessionId, session.id))
      .limit(1);
    if (!doc) {
      throw new HTTPException(409, { message: "No requirements document yet" });
    }

    if (await isOrgBudgetExhausted(session.organizationId)) {
      throw new HTTPException(429, {
        message: "Your organization's daily planning budget is exhausted — try again later",
      });
    }
    // Phase advance + agent claim in ONE conditional update — two separate
    // writes could strand the session in 'architecture' with no plan task
    // if a concurrent request stole the slot in between.
    const task = { kind: "plan_architecture" } as const;
    const [updated] = await db
      .update(schema.planningSessions)
      .set({ phase: "architecture", agentState: "working", agentTask: task, agentError: null })
      .where(
        and(
          eq(schema.planningSessions.id, session.id),
          eq(schema.planningSessions.phase, "requirements"),
          eq(schema.planningSessions.agentState, "idle"),
          eq(schema.planningSessions.status, "active"),
        ),
      )
      .returning();
    if (!updated) {
      throw new HTTPException(409, { message: "An agent is already working on this session" });
    }
    await publishPlanningEvent(db, session, { type: "phase", phase: "architecture", status: "active" });
    await publishPlanningEvent(db, session, { type: "agent_status", state: "working", actor: "planner" });
    runClaimedTask(updated, task);
    return c.json(toApiShape(updated), 202);
  })

  .post("/:id/edit", zValidator("json", editPromptBodySchema), async (c) => {
    const session = await loadSession(c, { mustBeCreator: true });
    requireActive(session);
    if (session.phase !== "architecture") {
      // ADR-02's inverse edge: free-text edits exist ONLY in Phase 2.
      throw new HTTPException(409, { message: "Edit prompts are only accepted during architecture planning" });
    }
    const { prompt } = c.req.valid("json");
    await startOrConflict(session, { kind: "edit_prompt", prompt });
    return c.json({ ok: true }, 202);
  })

  .post("/:id/retry", async (c) => {
    const session = await loadSession(c, { mustBeCreator: true });
    requireActive(session);
    if (session.agentState !== "error") {
      throw new HTTPException(409, { message: "Nothing to retry" });
    }
    const task = parseAgentTask(session.agentTask);
    if (!task) {
      throw new HTTPException(500, { message: "The failed task could not be reconstructed — start the step again" });
    }
    await startOrConflict(session, task);
    return c.json({ ok: true }, 202);
  })

  .post("/:id/confirm", async (c) => {
    const session = await loadSession(c, { mustBeCreator: true });
    requireActive(session);
    if (session.phase !== "architecture") {
      throw new HTTPException(409, { message: "Nothing to confirm yet" });
    }
    if (session.agentState !== "idle") {
      throw new HTTPException(409, { message: "Wait for the current agent run to finish" });
    }
    // The gate (01 §4.3): a pass verdict for the CURRENT graph version.
    const consistency = consistencyResultSchema.nullable().catch(null).parse(session.consistency);
    if (!consistency || consistency.graphVersion !== session.graphVersion) {
      throw new HTTPException(409, { message: "Consistency check hasn't covered the latest changes yet" });
    }
    if (consistency.status !== "pass") {
      return c.json(
        { error: "Consistency check found unresolved issues", issues: consistency.issues },
        409,
      );
    }
    try {
      const frozen = await confirmAndFreeze(session);
      return c.json(frozen, 201);
    } catch (error) {
      if (error instanceof ConfirmBlockedError) {
        throw new HTTPException(409, { message: error.message });
      }
      // Concurrent double-confirm: the loser hits the one-spec-per-session
      // unique index — a clean conflict, not a 500.
      if (isUniqueViolation(error, "build_specs_session_uidx")) {
        throw new HTTPException(409, { message: "This session is already confirmed" });
      }
      throw error;
    }
  })

  .post("/:id/abandon", async (c) => {
    const session = await loadSession(c, { mustBeCreator: true });
    requireActive(session);
    // Frees the ADR-29 slot; the row and its decision log stay readable.
    const [updated] = await db
      .update(schema.planningSessions)
      .set({ status: "abandoned", agentState: "idle", agentTask: null })
      .where(
        and(
          eq(schema.planningSessions.id, session.id),
          eq(schema.planningSessions.status, "active"),
        ),
      )
      .returning();
    if (!updated) {
      throw new HTTPException(409, { message: "Session is no longer active" });
    }
    await publishPlanningEvent(db, session, {
      type: "phase",
      phase: updated.phase,
      status: "abandoned",
    });
    return c.json(toApiShape(updated));
  })

  .get("/:id/export", async (c) => {
    const session = await loadSession(c);
    if (session.status !== "confirmed") {
      throw new HTTPException(409, { message: "Export is available after the architecture is confirmed" });
    }
    const bundle = await buildExportBundle(session);
    if (!bundle) {
      throw new HTTPException(404, { message: "No build spec found for this session" });
    }
    return c.body(bundle.content.slice().buffer as ArrayBuffer, 200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${bundle.filename}"`,
      "X-Content-Type-Options": "nosniff",
    });
  });
