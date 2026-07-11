import { betterAuth, APIError } from "better-auth";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { schema } from "@mullion/db";
import { db } from "../../lib/db.js";
import { env } from "../../config/env.js";
import { provisionPersonalOrg } from "./org.js";
import { isBlockedGitHubSignin } from "../github/signin-guard.js";

export const auth = betterAuth({
  baseURL: env.API_ORIGIN,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
  },
  trustedOrigins: [env.WEB_ORIGIN],
  // The linked GitHub token is repo-scoped and never expires — at-rest
  // encryption (AES-256-GCM, keyed off the auth secret) bounds a DB-read
  // exposure (Phase 3 audit M2). Better Auth default is plaintext.
  account: { encryptOAuthTokens: true },
  // GitHub is a LINK for build delivery (ADR-23/56), NOT a login. It's
  // configured only when an OAuth app is present (soft-optional), and the
  // hook below hard-blocks it as a sign-in method so ADR-35's
  // sign-in-required-via-email posture is a real guarantee, not a UI
  // convention.
  ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    ? {
        socialProviders: {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
            // Pin least-privilege SERVER-SIDE (ADR-23) — the granted scope
            // must not be decided by the client's linkSocial({scopes}) call.
            scope: ["repo"],
          },
        },
      }
    : {}),
  hooks: {
    before: async (ctx) => {
      // Reject GitHub as a SIGN-IN method — it may only be LINKED from an
      // authenticated session via /link-social (ADR-56). The effective guard
      // is /sign-in/social with provider=github (a POST carrying the provider
      // in the body); /link-social is session-gated by Better Auth itself, and
      // the OAuth /callback carries no body.provider so it is not (and must
      // not be) blocked here — blocking it would break link-social's callback.
      // The context type is narrower than runtime, so read through a view.
      const { path, body } = ctx as unknown as { path?: string; body?: { provider?: string } };
      if (isBlockedGitHubSignin(path, body)) {
        throw new APIError("FORBIDDEN", { message: "GitHub is a link-only provider, not a sign-in method" });
      }
    },
  },
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
