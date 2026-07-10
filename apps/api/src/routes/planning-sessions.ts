import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { schema } from "@mullion/db";
import { createPlanningSessionBodySchema, type PlanningSession } from "@mullion/schemas";
import { db } from "../db.js";
import { requireOrgMember, type RequiredAuthVariables } from "../middleware/session.js";
import { streamEvents } from "../sse.js";

type SessionRow = typeof schema.planningSessions.$inferSelect;

function toApiShape(row: SessionRow): PlanningSession {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    status: row.status,
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

export const planningSessionsRoute = new Hono<{ Variables: RequiredAuthVariables }>()
  .use(requireOrgMember)

  .post("/", zValidator("json", createPlanningSessionBodySchema), async (c) => {
    const user = c.get("user");
    const organizationId = c.get("organizationId");
    const { idea } = c.req.valid("json");

    try {
      const [created] = await db
        .insert(schema.planningSessions)
        .values({ organizationId, userId: user.id, idea })
        .returning();
      if (!created) {
        throw new HTTPException(500, { message: "Session insert returned no row" });
      }
      return c.json(toApiShape(created), 201);
    } catch (error) {
      // ADR-29: the partial unique index is the enforcement; the API's job
      // is to hand back the existing active session, not a duplicate.
      if (isUniqueViolation(error, "planning_sessions_one_active_per_user")) {
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
        // ADR-29 is per user across orgs — but only hand the session back
        // when it belongs to the org the caller is acting in; a mismatch
        // would confuse client state with a foreign-org object.
        if (existing && existing.organizationId === organizationId) {
          return c.json(toApiShape(existing), 200);
        }
        if (existing) {
          throw new HTTPException(409, {
            message: "An active session exists in another organization",
          });
        }
      }
      throw error;
    }
  })

  .get("/:id", async (c) => {
    const organizationId = c.get("organizationId");
    const [row] = await db
      .select()
      .from(schema.planningSessions)
      .where(
        and(
          // Org scoping in the query itself, not just the middleware
          // (ADR-36) — an id from another tenant behaves like a missing row.
          eq(schema.planningSessions.id, c.req.param("id")),
          eq(schema.planningSessions.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new HTTPException(404, { message: "Session not found" });
    }
    return c.json(toApiShape(row));
  })

  .get("/:id/stream", async (c) => {
    const organizationId = c.get("organizationId");
    const user = c.get("user");
    const [row] = await db
      .select({ id: schema.planningSessions.id })
      .from(schema.planningSessions)
      .where(
        and(
          eq(schema.planningSessions.id, c.req.param("id")),
          eq(schema.planningSessions.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new HTTPException(404, { message: "Session not found" });
    }
    return streamEvents(c, { db, streamId: row.id, organizationId, userId: user.id });
  });
