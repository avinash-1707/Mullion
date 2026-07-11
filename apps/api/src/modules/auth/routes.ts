import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, isNotNull } from "drizzle-orm";
import { schema } from "@mullion/db";
import { db } from "../../lib/db.js";
import { requireOrgMember, type RequiredAuthVariables } from "../../middleware/session.js";
import { auth } from "./auth.js";

const setPasswordSchema = z.object({
  newPassword: z.string().min(8).max(256),
});

/**
 * Account self-service beyond what Better Auth exposes over HTTP.
 * set-password lets a social-first account (no credential row — the empty
 * password field is the flag, ADR-66) add a password from an authenticated
 * session. Accounts that already have one must use change-password (which
 * demands the current password) — a session alone must never be enough to
 * ROTATE a password, only to create a first one.
 */
export const accountRoute = new Hono<{ Variables: RequiredAuthVariables }>()
  .use(requireOrgMember)
  .post("/set-password", zValidator("json", setPasswordSchema), async (c) => {
    const user = c.get("user");
    const existing = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(
        and(
          eq(schema.account.userId, user.id),
          eq(schema.account.providerId, "credential"),
          isNotNull(schema.account.password),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      throw new HTTPException(409, {
        message: "Account already has a password — use change password.",
      });
    }
    const { newPassword } = c.req.valid("json");
    await auth.api.setPassword({
      body: { newPassword },
      headers: c.req.raw.headers,
    });
    return c.json({ ok: true });
  });
