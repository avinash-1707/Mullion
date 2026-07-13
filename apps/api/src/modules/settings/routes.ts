import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { schema } from "@mullion/db";
import { MODEL_ALLOWLIST, ModelNotAllowedError, assertAllowed, isModelAllowed } from "@mullion/llm";
import { agentRoleSchema, listBuildsQuerySchema } from "@mullion/schemas";
import { decodeBuildsCursor, encodeBuildsCursor } from "../builds/cursor.js";
import { db } from "../../lib/db.js";
import { llm } from "../../lib/llm.js";
import { env } from "../../config/env.js";
import {
  canManage,
  requireOrgAdmin,
  requireOrgMember,
  type RequiredAuthVariables,
} from "../../middleware/session.js";
import { encryptByokKey, getOrgByokStatus } from "./byok.js";

const saveKeySchema = z.object({
  // OpenRouter keys are ~sk-or-v1-… strings; bound loosely, never logged.
  apiKey: z.string().min(20).max(512),
});

const putModelSchema = z.object({
  role: agentRoleSchema,
  // null = "Platform default" — deletes the override row (ADR-71).
  modelSlug: z.string().min(1).max(200).nullable(),
});

const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

// The per-run list shares the tiles' window (days) and the builds list's
// keyset paging contract (ADR-77: opaque cursor, limit default 20 cap 50).
const analyticsRunsQuerySchema = analyticsQuerySchema.extend(listBuildsQuerySchema.shape);

// ADR-70: each save is an outbound OpenRouter probe — much tighter than the
// global per-user window, mirroring credentialRateLimit's posture.
const byokSaveRateLimit = rateLimiter<{ Variables: RequiredAuthVariables }>({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  keyGenerator: (c) => `byok:${c.get("user").id}`,
});

/**
 * Org settings self-service (ADR-70/71): BYOK key lifecycle, per-role model
 * overrides, and the usage analytics behind the dashboard settings page.
 * Everything is org-scoped through requireOrgMember (ADR-36).
 */
export const settingsRoute = new Hono<{ Variables: RequiredAuthVariables }>()
  .use(requireOrgMember)

  .get("/byok", async (c) => {
    const organizationId = c.get("organizationId");
    const status = await getOrgByokStatus(db, organizationId);
    // canManage drives the UI's read-only state for plain members — the
    // server-side requireOrgAdmin gate on mutations is the real enforcement.
    return c.json({ ...status, canManage: canManage(c.get("orgRole")) });
  })

  .post("/byok", requireOrgAdmin, byokSaveRateLimit, zValidator("json", saveKeySchema), async (c) => {
    const organizationId = c.get("organizationId");
    const user = c.get("user");
    const { apiKey } = c.req.valid("json");

    // Probe before persist (ADR-70) — a key that can't authenticate never
    // lands in the table. Skipped where no real OpenRouter is reachable:
    // replay/record runs have no cassette for the key-info endpoint, and a
    // dev loopback mock (OPENROUTER_BASE_URL) doesn't implement GET /key.
    // Production always probes — env.ts forbids both overrides there.
    const probeSkipped =
      env.LLM_REPLAY_MODE !== "off" ||
      (env.NODE_ENV !== "production" && Boolean(env.OPENROUTER_BASE_URL));
    if (!probeSkipped) {
      const { valid } = await llm.validateKey(apiKey);
      if (!valid) {
        throw new HTTPException(400, { message: "OpenRouter rejected this key" });
      }
    }

    const encryptedKey = await encryptByokKey(apiKey);
    const keyLast4 = apiKey.slice(-4);
    await db
      .insert(schema.byokKeys)
      .values({ organizationId, userId: user.id, encryptedKey, keyLast4, enabled: true })
      .onConflictDoUpdate({
        target: schema.byokKeys.organizationId,
        set: { userId: user.id, encryptedKey, keyLast4, enabled: true },
      });
    return c.json({ ok: true, keyLast4 });
  })

  .delete("/byok", requireOrgAdmin, async (c) => {
    const organizationId = c.get("organizationId");
    await db.delete(schema.byokKeys).where(eq(schema.byokKeys.organizationId, organizationId));
    // Override rows stay — they simply stop applying without an enabled key
    // (ADR-71), and re-adding a key restores the user's picks.
    return c.json({ ok: true });
  })

  .get("/models", async (c) => {
    const organizationId = c.get("organizationId");
    const [byok, defaults, overrides] = await Promise.all([
      getOrgByokStatus(db, organizationId),
      db.select().from(schema.modelRouting),
      db
        .select({ role: schema.modelOverrides.role, modelSlug: schema.modelOverrides.modelSlug })
        .from(schema.modelOverrides)
        .where(eq(schema.modelOverrides.organizationId, organizationId)),
    ]);
    const overrideByRole = new Map(overrides.map((o) => [o.role, o.modelSlug]));
    const roles = defaults.map((d) => {
      // Coerce through the allowlist so display matches runtime: a stored
      // override whose slug was later removed from the curated list already
      // resolves to the platform default (resolveModel's read-time
      // fail-safe, ADR-71) — reporting the dead slug would render a blank
      // <select> and show the UI disagreeing with what actually runs.
      const override = overrideByRole.get(d.role);
      return {
        role: d.role,
        defaultModelSlug: d.modelSlug,
        overrideModelSlug: override && isModelAllowed(d.role, override) ? override : null,
        allowlist: MODEL_ALLOWLIST[d.role],
      };
    });
    return c.json({
      byokEnabled: byok.hasKey && byok.enabled,
      canManage: canManage(c.get("orgRole")),
      roles,
    });
  })

  .put("/models", requireOrgAdmin, zValidator("json", putModelSchema), async (c) => {
    const organizationId = c.get("organizationId");
    const { role, modelSlug } = c.req.valid("json");

    if (modelSlug === null) {
      await db
        .delete(schema.modelOverrides)
        .where(
          and(
            eq(schema.modelOverrides.organizationId, organizationId),
            eq(schema.modelOverrides.role, role),
          ),
        );
      return c.json({ ok: true });
    }

    // ADR-71: platform pays → platform picks. Custom slugs need an enabled
    // BYOK key, and must sit inside the ZDR-verified allowlist.
    const byok = await getOrgByokStatus(db, organizationId);
    if (!byok.hasKey || !byok.enabled) {
      throw new HTTPException(409, {
        message: "Custom model selection requires an active BYOK key",
      });
    }
    try {
      assertAllowed(role, modelSlug);
    } catch (error) {
      if (error instanceof ModelNotAllowedError) {
        throw new HTTPException(400, { message: error.message });
      }
      throw error;
    }
    await db
      .insert(schema.modelOverrides)
      .values({ organizationId, role, modelSlug })
      .onConflictDoUpdate({
        target: [schema.modelOverrides.organizationId, schema.modelOverrides.role],
        set: { modelSlug },
      });
    return c.json({ ok: true });
  })

  // Per-run LLM spend for the analytics tab's runs list. Windowed on
  // cost_events.createdAt — the SAME window the tiles use — so the list's
  // sums reconcile with the totals above it by construction; what it cannot
  // include is planning-session spend (run_id IS NULL — in the tiles, but
  // there's no run row to attach it to), which the UI footnotes instead of
  // faking a synthetic row. A boundary-spanning run therefore shows only its
  // in-window slice, labeled "Cost (30d)", never "run total".
  .get("/analytics/runs", zValidator("query", analyticsRunsQuerySchema), async (c) => {
    const organizationId = c.get("organizationId");
    const { days, cursor: rawCursor, limit } = c.req.valid("query");
    const cursor = rawCursor === undefined ? null : decodeBuildsCursor(rawCursor);
    if (rawCursor !== undefined && cursor === null) {
      throw new HTTPException(400, { message: "Invalid cursor" });
    }

    const rows = await db
      .select({
        runId: schema.runs.id,
        status: schema.runs.status,
        createdAt: schema.runs.createdAt,
        costUsd: sql<string>`sum(${schema.costEvents.cost})`,
        promptTokens: sql<string>`coalesce(sum(${schema.costEvents.promptTokens}), 0)`,
        completionTokens: sql<string>`coalesce(sum(${schema.costEvents.completionTokens}), 0)`,
        calls: sql<string>`count(*)`,
      })
      .from(schema.costEvents)
      // Org re-asserted on the join arm too (ADR-36) — the FK alone would
      // let a mis-attributed event join across orgs.
      .innerJoin(
        schema.runs,
        and(
          eq(schema.runs.id, schema.costEvents.runId),
          eq(schema.runs.organizationId, schema.costEvents.organizationId),
        ),
      )
      .where(
        and(
          eq(schema.costEvents.organizationId, organizationId),
          eq(schema.costEvents.source, "llm"),
          sql`${schema.costEvents.createdAt} >= now() - make_interval(days => ${days})`,
          // Planning-session spend has no run — excluded here, footnoted in
          // the UI (see the route comment above).
          isNotNull(schema.costEvents.runId),
          // Keyset on the grouped ordering columns — row-value comparison
          // matching the composite ORDER BY, as in the builds list (ADR-77).
          cursor
            ? sql`(${schema.runs.createdAt}, ${schema.runs.id}) < (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`
            : undefined,
        ),
      )
      .groupBy(schema.runs.id, schema.runs.status, schema.runs.createdAt)
      .orderBy(desc(schema.runs.createdAt), desc(schema.runs.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > limit && last ? encodeBuildsCursor({ createdAt: last.createdAt, id: last.runId }) : null;

    return c.json({
      days,
      items: page.map((row) => ({
        runId: row.runId,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        costUsd: Number(row.costUsd),
        promptTokens: Number(row.promptTokens),
        completionTokens: Number(row.completionTokens),
        calls: Number(row.calls),
      })),
      nextCursor,
    });
  })

  .get("/analytics", zValidator("query", analyticsQuerySchema), async (c) => {
    const organizationId = c.get("organizationId");
    const { days } = c.req.valid("query");
    const since = sql`now() - make_interval(days => ${days})`;
    // LLM-only across ALL three aggregates — mixing sources would make the
    // totals disagree with the per-role breakdown once sandbox rows exist
    // (review finding). Sandbox spend gets its own surface when it matters.
    const orgWindow = and(
      eq(schema.costEvents.organizationId, organizationId),
      eq(schema.costEvents.source, "llm"),
      sql`${schema.costEvents.createdAt} >= ${since}`,
    );

    const [totalsRows, byRole, byDay] = await Promise.all([
      db
        .select({
          costUsd: sql<string>`coalesce(sum(${schema.costEvents.cost}), 0)`,
          byokCostUsd: sql<string>`coalesce(sum(${schema.costEvents.cost}) filter (where ${schema.costEvents.byok}), 0)`,
          promptTokens: sql<string>`coalesce(sum(${schema.costEvents.promptTokens}), 0)`,
          completionTokens: sql<string>`coalesce(sum(${schema.costEvents.completionTokens}), 0)`,
          calls: sql<string>`count(*) filter (where ${schema.costEvents.source} = 'llm')`,
        })
        .from(schema.costEvents)
        .where(orgWindow),
      db
        .select({
          role: schema.costEvents.role,
          costUsd: sql<string>`sum(${schema.costEvents.cost})`,
          promptTokens: sql<string>`coalesce(sum(${schema.costEvents.promptTokens}), 0)`,
          completionTokens: sql<string>`coalesce(sum(${schema.costEvents.completionTokens}), 0)`,
          calls: sql<string>`count(*)`,
        })
        .from(schema.costEvents)
        .where(and(orgWindow, eq(schema.costEvents.source, "llm")))
        .groupBy(schema.costEvents.role),
      db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${schema.costEvents.createdAt}), 'YYYY-MM-DD')`,
          costUsd: sql<string>`sum(${schema.costEvents.cost})`,
          promptTokens: sql<string>`coalesce(sum(${schema.costEvents.promptTokens}), 0)`,
          completionTokens: sql<string>`coalesce(sum(${schema.costEvents.completionTokens}), 0)`,
        })
        .from(schema.costEvents)
        .where(orgWindow)
        .groupBy(sql`date_trunc('day', ${schema.costEvents.createdAt})`)
        .orderBy(sql`date_trunc('day', ${schema.costEvents.createdAt})`),
    ]);

    const totals = totalsRows[0];
    return c.json({
      days,
      totals: {
        costUsd: Number(totals?.costUsd ?? 0),
        byokCostUsd: Number(totals?.byokCostUsd ?? 0),
        promptTokens: Number(totals?.promptTokens ?? 0),
        completionTokens: Number(totals?.completionTokens ?? 0),
        llmCalls: Number(totals?.calls ?? 0),
      },
      byRole: byRole.map((r) => ({
        role: r.role ?? "unknown",
        costUsd: Number(r.costUsd),
        promptTokens: Number(r.promptTokens),
        completionTokens: Number(r.completionTokens),
        calls: Number(r.calls),
      })),
      byDay: byDay.map((d) => ({
        day: d.day,
        costUsd: Number(d.costUsd),
        promptTokens: Number(d.promptTokens),
        completionTokens: Number(d.completionTokens),
      })),
    });
  });
