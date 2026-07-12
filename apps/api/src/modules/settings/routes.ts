import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@mullion/db";
import { MODEL_ALLOWLIST, ModelNotAllowedError, assertAllowed } from "@mullion/llm";
import { agentRoleSchema } from "@mullion/schemas";
import { db } from "../../lib/db.js";
import { llm } from "../../lib/llm.js";
import { env } from "../../config/env.js";
import { requireOrgMember, type RequiredAuthVariables } from "../../middleware/session.js";
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

// ADR-70: each save is an outbound OpenRouter probe — much tighter than the
// global per-user window, mirroring credentialRateLimit's posture.
const byokSaveRateLimit = rateLimiter<{ Variables: RequiredAuthVariables }>({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: "draft-7",
  keyGenerator: (c) => `byok:${c.get("user").id}`,
});

/**
 * ADR-70 (review finding): the mutating settings surface moves the org's
 * money — setting/removing the key flips billing source, model picks steer
 * per-call cost — so it is owner/admin only. Reads stay open to members.
 */
const requireOrgAdmin = createMiddleware<{ Variables: RequiredAuthVariables }>(
  async (c, next) => {
    if (!["owner", "admin"].includes(c.get("orgRole"))) {
      throw new HTTPException(403, {
        message: "Only an organization owner or admin can change billing settings",
      });
    }
    await next();
  },
);

/**
 * Org settings self-service (ADR-70/71): BYOK key lifecycle, per-role model
 * overrides, and the usage analytics behind the dashboard settings page.
 * Everything is org-scoped through requireOrgMember (ADR-36).
 */
export const settingsRoute = new Hono<{ Variables: RequiredAuthVariables }>()
  .use(requireOrgMember)

  .get("/byok", async (c) => {
    const organizationId = c.get("organizationId");
    return c.json(await getOrgByokStatus(db, organizationId));
  })

  .post("/byok", requireOrgAdmin, byokSaveRateLimit, zValidator("json", saveKeySchema), async (c) => {
    const organizationId = c.get("organizationId");
    const user = c.get("user");
    const { apiKey } = c.req.valid("json");

    // Probe before persist (ADR-70) — a key that can't authenticate never
    // lands in the table. Replay/record runs have no cassette for the
    // key-info endpoint, so the probe is skipped there (dev/test only).
    if (env.LLM_REPLAY_MODE === "off") {
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
    const roles = defaults.map((d) => ({
      role: d.role,
      defaultModelSlug: d.modelSlug,
      overrideModelSlug: overrideByRole.get(d.role) ?? null,
      allowlist: MODEL_ALLOWLIST[d.role],
    }));
    return c.json({ byokEnabled: byok.hasKey && byok.enabled, roles });
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
