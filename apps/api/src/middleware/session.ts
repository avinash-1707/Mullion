import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { schema } from "@mullion/db";
import { auth, type AuthSession } from "../modules/auth/auth.js";
import { db } from "../lib/db.js";
import { provisionPersonalOrg } from "../modules/auth/org.js";

export interface AuthVariables {
  user: AuthSession["user"] | null;
  session: AuthSession["session"] | null;
}

export interface RequiredAuthVariables {
  user: AuthSession["user"];
  session: AuthSession["session"];
  organizationId: string;
}

/** Resolves the Better Auth session (if any) onto the context. */
export const sessionMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", session?.user ?? null);
    c.set("session", session?.session ?? null);
    await next();
  },
);

/**
 * Sign-in wall (ADR-35) + tenancy gate (ADR-36): rejects anonymous callers,
 * then verifies actual membership of the active org against the member
 * table — the session's activeOrganizationId alone is a claim, not proof.
 */
export const requireOrgMember = createMiddleware<{ Variables: RequiredAuthVariables }>(
  async (c, next) => {
    const user = c.get("user");
    const session = c.get("session");
    if (!user || !session) {
      throw new HTTPException(401, { message: "Sign in required" });
    }
    let organizationId = session.activeOrganizationId;
    if (organizationId) {
      const membership = await db
        .select({ id: schema.member.id })
        .from(schema.member)
        .where(
          and(
            eq(schema.member.userId, user.id),
            eq(schema.member.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!membership[0]) {
        // Stale claim (e.g. removed from the org, or the org was deleted) —
        // fall through to the fallback below instead of 403-locking a user
        // who still has valid memberships elsewhere.
        organizationId = null;
      }
    }
    if (!organizationId) {
      // The signup-time auth session is created before the personal-org
      // hook's rows are visible, so its activeOrganizationId lands null —
      // fall back to the user's first membership and heal the session row.
      const memberships = await db
        .select({ organizationId: schema.member.organizationId })
        .from(schema.member)
        .where(eq(schema.member.userId, user.id))
        .limit(1);
      organizationId = memberships[0]?.organizationId ?? null;
      if (!organizationId) {
        // Zero memberships = signup provisioning failed mid-flight. Without
        // this the account is permanently locked out — re-provision instead.
        organizationId = await provisionPersonalOrg(db, user);
      }
      await db
        .update(schema.session)
        .set({ activeOrganizationId: organizationId })
        .where(eq(schema.session.id, session.id));
    }
    c.set("organizationId", organizationId);
    await next();
  },
);
