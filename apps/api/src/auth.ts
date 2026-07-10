import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { schema } from "@mullion/db";
import { db } from "./db.js";
import { env } from "./env.js";
import { provisionPersonalOrg } from "./org.js";

export const auth = betterAuth({
  baseURL: env.API_ORIGIN,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [env.WEB_ORIGIN],
  plugins: [
    // Personal org is the only ownership model in v1 (ADR-36) — users don't
    // hand-create orgs, they get one at signup and invite into it.
    organization({ allowUserToCreateOrganization: false }),
  ],
  databaseHooks: {
    user: {
      create: {
        // ADR-37: direct Drizzle inserts, not auth.api.createOrganization —
        // signup runs inside a DB transaction since Better Auth 1.3.10, and
        // the api call can't see the uncommitted user row.
        after: async (user) => {
          await provisionPersonalOrg(db, user);
        },
      },
    },
    session: {
      create: {
        // Every auth session starts with an active org, so org-scoped
        // middleware never sees a null tenant for a signed-in user.
        before: async (session) => {
          const memberships = await db
            .select({ organizationId: schema.member.organizationId })
            .from(schema.member)
            .where(eq(schema.member.userId, session.userId))
            .limit(1);
          return {
            data: {
              ...session,
              activeOrganizationId: memberships[0]?.organizationId ?? null,
            },
          };
        },
      },
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;
