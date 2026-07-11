import { betterAuth, APIError } from "better-auth";
import { childLogger } from "@mullion/logger";
import { emailOTP, genericOAuth, organization } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { and, eq, isNotNull } from "drizzle-orm";
import { schema } from "@mullion/db";
import { db } from "../../lib/db.js";
import { env } from "../../config/env.js";
import { sendEmail } from "../email/send.js";
import { renderOtpEmail } from "../email/templates.js";
import { provisionPersonalOrg } from "./org.js";
import { isOtpSignInAttempt } from "./otp-signin-guard.js";
import { isBlockedGitHubSignin } from "../github/signin-guard.js";

// Per-EMAIL OTP send cap (the 10/min/IP window doesn't stop an IP-rotating
// attacker from flooding one victim's inbox / our Resend spend). In-memory is
// fine while the API is a single persistent process — same tradeoff as the
// rate-limit MemoryStore; move to Redis alongside it.
const OTP_SEND_WINDOW_MS = 60 * 60_000;
const OTP_SEND_MAX_PER_EMAIL = 6;
const otpSendLog = new Map<string, number[]>();

function otpSendAllowed(email: string, now = Date.now()): boolean {
  const key = email.trim().toLowerCase();
  const cutoff = now - OTP_SEND_WINDOW_MS;
  const recent = (otpSendLog.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length >= OTP_SEND_MAX_PER_EMAIL) {
    otpSendLog.set(key, recent);
    return false;
  }
  recent.push(now);
  otpSendLog.set(key, recent);
  // Bound the map: opportunistically drop stale entries once it grows.
  if (otpSendLog.size > 10_000) {
    for (const [k, times] of otpSendLog) {
      if (times.every((t) => t <= cutoff)) otpSendLog.delete(k);
    }
  }
  return true;
}

/** Does this email belong to an account with a credential password? */
async function hasCredentialPassword(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.account.id })
    .from(schema.account)
    .innerJoin(schema.user, eq(schema.account.userId, schema.user.id))
    .where(
      and(
        // Trim + lowercase to match Better Auth's own email normalization —
        // a mismatch here would let a password account reach the OTP path.
        eq(schema.user.email, email.trim().toLowerCase()),
        eq(schema.account.providerId, "credential"),
        isNotNull(schema.account.password),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// Social providers are soft-optional (dev boots without any): the delivery
// GitHub app (repo scope, link-only — ADR-23/56) and Google as a LOGIN
// (ADR-65). GitHub login rides a SECOND minimal-scope app via genericOAuth
// below, never this repo-scoped one.
const socialProviders = {
  ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
          // Pin least-privilege SERVER-SIDE (ADR-23) — the granted scope
          // must not be decided by the client's linkSocial({scopes}) call.
          scope: ["repo"],
        },
      }
    : {}),
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
};

export const auth = betterAuth({
  baseURL: env.API_ORIGIN,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    // Credential accounts must prove email ownership (OTP) before first
    // sign-in (ADR-66). sendOnSignIn below re-sends the OTP on the blocked
    // attempt so a returning unverified user isn't stranded on an expired code.
    requireEmailVerification: true,
    // A reset after compromise must end every live session — the emailOTP
    // reset flow only revokes when this core flag is set.
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    // All three route through the emailOTP plugin's sendVerificationOTP
    // because of overrideDefaultEmailVerification below — no link flow exists.
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
  trustedOrigins: [env.WEB_ORIGIN, env.DASHBOARD_ORIGIN],
  // The linked GitHub token is repo-scoped and never expires — at-rest
  // encryption (AES-256-GCM, keyed off the auth secret) bounds a DB-read
  // exposure (Phase 3 audit M2). Better Auth default is plaintext.
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      // Implicit same-email linking is safe HERE because every credential
      // account is OTP-verified before it is usable (requireEmailVerification)
      // and both login providers (Google, github-login) report verified
      // emails — the classic pre-hijack path (attacker parks an unverified
      // credential row on the victim's email) dead-ends at verification
      // (ADR-66). trustedProviders stays empty: nothing may bypass the
      // provider-verified-email check.
      enabled: true,
      // Required so the delivery GitHub app can link when the user's GitHub
      // email differs from their Mullion email (ADR-56 flow stays intact).
      allowDifferentEmails: true,
    },
  },
  ...(Object.keys(socialProviders).length > 0 ? { socialProviders } : {}),
  hooks: {
    before: async (ctx) => {
      // The context type is narrower than runtime, so read through a view.
      const { path, body } = ctx as unknown as {
        path?: string;
        body?: { provider?: string; email?: string; type?: string };
      };
      // Reject GitHub (the repo-scoped delivery app) as a SIGN-IN method —
      // it may only be LINKED from an authenticated session via /link-social
      // (ADR-56). GitHub LOGIN goes through the separate github-login
      // genericOAuth app on /sign-in/oauth2, which this guard ignores.
      if (isBlockedGitHubSignin(path, body)) {
        throw new APIError("FORBIDDEN", { message: "GitHub is a link-only provider, not a sign-in method" });
      }
      // Passwordless OTP sign-in is reserved for accounts WITHOUT a
      // credential password (ADR-66) — the empty password field is the flag.
      if (isOtpSignInAttempt(path, body) && body?.email && (await hasCredentialPassword(body.email))) {
        throw new APIError("FORBIDDEN", {
          message: "This account has a password — sign in with it instead.",
        });
      }
    },
  },
  plugins: [
    // Personal org is the only ownership model in v1 (ADR-36) — users don't
    // hand-create orgs, they get one at signup and invite into it.
    organization({ allowUserToCreateOrganization: false }),
    // One OTP mechanism for email verification, password reset, and
    // (passwordless-only) sign-in — no link-based flows (ADR-66/67).
    emailOTP({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      // verification.value holds a hash, never the raw code.
      storeOTP: "hashed",
      // Route the core email-verification flow (sendOnSignUp, the
      // requireEmailVerification re-send) through OTP instead of links.
      overrideDefaultEmailVerification: true,
      // /sign-in/email-otp must never mint accounts — sign-up is the only
      // registration path for credentials (and OAuth for social).
      disableSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        // Silent drop, not an error — a distinct response here would be an
        // enumeration/abuse signal, and the legitimate user still has the
        // codes already in their inbox.
        if (!otpSendAllowed(email)) {
          childLogger({ module: "auth" }).warn({ email, type }, "per-email OTP send cap hit — dropped");
          return;
        }
        await sendEmail({ to: email, ...renderOtpEmail(type, otp) });
      },
    }),
    // GitHub as a LOGIN (ADR-65): second OAuth app, minimal scope — the
    // repo-scoped delivery app stays link-only above. genericOAuth because
    // Better Auth allows one config per built-in provider id.
    ...(env.GITHUB_LOGIN_CLIENT_ID && env.GITHUB_LOGIN_CLIENT_SECRET
      ? [
          genericOAuth({
            config: [
              {
                providerId: "github-login",
                clientId: env.GITHUB_LOGIN_CLIENT_ID,
                clientSecret: env.GITHUB_LOGIN_CLIENT_SECRET,
                authorizationUrl: "https://github.com/login/oauth/authorize",
                tokenUrl: "https://github.com/login/oauth/access_token",
                scopes: ["read:user", "user:email"],
                // GitHub's /user hides private emails and reports no verified
                // flag — pull /user/emails so emailVerified is GitHub's own
                // verdict. Linking safety (accountLinking above) depends on
                // this being accurate, not assumed.
                async getUserInfo(tokens) {
                  const headers = {
                    Authorization: `Bearer ${tokens.accessToken ?? ""}`,
                    Accept: "application/vnd.github+json",
                    "User-Agent": "mullion-api",
                  };
                  const profileRes = await fetch("https://api.github.com/user", { headers });
                  if (!profileRes.ok) return null;
                  const profile = (await profileRes.json()) as {
                    id: number;
                    login: string;
                    name: string | null;
                    email: string | null;
                    avatar_url?: string;
                  };
                  // Fail closed on a transient /user/emails failure — a
                  // silently-unverified identity would give the user a
                  // confusing linking rejection instead of a clean retry.
                  const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
                  if (!emailsRes.ok) return null;
                  let email = profile.email;
                  let emailVerified = false;
                  const emails = (await emailsRes.json()) as Array<{
                    email: string;
                    primary: boolean;
                    verified: boolean;
                  }>;
                  const primary = emails.find((e) => e.primary) ?? emails[0];
                  if (primary) {
                    email = primary.email;
                    emailVerified = primary.verified;
                  }
                  return {
                    id: String(profile.id),
                    name: profile.name ?? profile.login,
                    email,
                    image: profile.avatar_url,
                    emailVerified,
                  };
                },
              },
            ],
          }),
        ]
      : []),
  ],
  databaseHooks: {
    user: {
      update: {
        // Avatar reuses the core `image` field (ADR-66) but the value is
        // client-supplied via update-user — pin it to a bounded https URL so
        // javascript:/data: payloads never reach an <img src>.
        before: async (user) => {
          const image = (user as { image?: unknown }).image;
          if (typeof image === "string" && image.length > 0) {
            let valid = image.length <= 2048;
            if (valid) {
              try {
                valid = new URL(image).protocol === "https:";
              } catch {
                valid = false;
              }
            }
            if (!valid) {
              throw new APIError("BAD_REQUEST", { message: "Avatar must be an https:// URL (max 2048 chars)" });
            }
          }
          return { data: user };
        },
      },
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
