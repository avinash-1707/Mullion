import { and, asc, eq } from "drizzle-orm";
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
  /** Better Auth org role of the verified membership: owner | admin | member. */
  orgRole: string;
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
    let orgRole: string | null = null;
    if (organizationId) {
      const membership = await db
        .select({ id: schema.member.id, role: schema.member.role })
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
      } else {
        orgRole = membership[0].role;
      }
    }
    if (!organizationId) {
      // The signup-time auth session is created before the personal-org
      // hook's rows are visible, so its activeOrganizationId lands null —
      // fall back to the user's OLDEST membership (deterministic, always
      // the personal org — ADR-72) and heal the session row. Keep the
      // ordering in sync with session.create.before in auth.ts.
      const memberships = await db
        .select({ organizationId: schema.member.organizationId, role: schema.member.role })
        .from(schema.member)
        .where(eq(schema.member.userId, user.id))
        .orderBy(asc(schema.member.createdAt), asc(schema.member.id))
        .limit(1);
      organizationId = memberships[0]?.organizationId ?? null;
      orgRole = memberships[0]?.role ?? null;
      if (!organizationId) {
        // Zero memberships = signup provisioning failed mid-flight. Without
        // this the account is permanently locked out — re-provision instead.
        organizationId = await provisionPersonalOrg(db, user);
        // provisionPersonalOrg creates the membership as the org's admin.
        orgRole = "admin";
      }
      await db
        .update(schema.session)
        .set({ activeOrganizationId: organizationId })
        .where(eq(schema.session.id, session.id));
    }
    c.set("organizationId", organizationId);
    c.set("orgRole", orgRole ?? "member");
    await next();
  },
);

/**
 * ADR-70/72: mutations that move the org's money or its roster are
 * admin-only; reads stay open to every member. "owner" stays accepted
 * until the owner→admin migration has provably zeroed those rows —
 * drop it in the post-migration cleanup.
 */
export function canManage(orgRole: string): boolean {
  return ["owner", "admin"].includes(orgRole);
}

export const requireOrgAdmin = createMiddleware<{ Variables: RequiredAuthVariables }>(
  async (c, next) => {
    if (!canManage(c.get("orgRole"))) {
      throw new HTTPException(403, {
        message: "Only an organization admin can do that",
      });
    }
    await next();
  },
);
