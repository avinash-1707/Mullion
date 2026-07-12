import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Hono } from "hono";
import { initLogger } from "@mullion/logger";

/**
 * HTTP/auth route-test harness (Phase 3 debt): boots the real wired Hono app
 * against a live Postgres and drives it end to end through the whole
 * middleware stack (CORS/CSRF → rate limit → session → route). This is the
 * apps/api counterpart to the orchestrator/sandbox integration tiers.
 *
 * Gated by API_INTEGRATION=1 (needs a real DATABASE_URL); a claimed-DB
 * environment can't silently skip. The non-DB env vars get test defaults so
 * importing the app (which parses env at load) doesn't require a full .env.
 */

const integration = process.env["API_INTEGRATION"] === "1";

// Every test here is several HTTP round trips against a remote Postgres —
// vitest's 5s default is inside normal tail latency for the slower ones.
vi.setConfig({ testTimeout: 30_000 });
const WEB_ORIGIN = "http://localhost:3000";
const DASHBOARD_ORIGIN = "http://localhost:3001";

interface Harness {
  app: Hono;
  pool: { end: () => Promise<void> };
  // Direct DB access for states the HTTP surface can't produce (e.g. a
  // social-first user with no credential row, normally minted by OAuth).
  db: typeof import("./lib/db.js")["db"];
}

// Every emitted log line, JSON-parsed lazily — the console email driver
// (EMAIL_DRIVER=console under NODE_ENV=test) logs each OTP email here, which
// is how the harness reads verification/reset codes back out.
const logLines: string[] = [];

async function boot(): Promise<Harness> {
  process.env["NODE_ENV"] ??= "test";
  process.env["BETTER_AUTH_SECRET"] ??= "test-secret-at-least-32-characters-long-000";
  process.env["API_ORIGIN"] ??= "http://localhost:8787";
  process.env["WEB_ORIGIN"] ??= WEB_ORIGIN;
  process.env["DASHBOARD_ORIGIN"] ??= DASHBOARD_ORIGIN;
  process.env["OPENROUTER_API_KEY"] ??= "test-key";
  // Per-test-user rate-limit isolation: trust one forwarded hop so each
  // harness user can present a distinct IP instead of sharing "unknown".
  process.env["TRUSTED_PROXY_HOPS"] ??= "1";
  // initLogger BEFORE the app imports — module-scope childLogger() calls
  // (email driver included) bind to whatever root exists at import time.
  initLogger({
    service: "test-api",
    level: "info",
    stream: { write: (line: string) => void logLines.push(line) },
  });
  // DATABASE_URL is deliberately NOT defaulted — the test needs a real one.
  const [{ createApp }, { pool }, { seedModelRouting }, { db }] = await Promise.all([
    import("./app.js"),
    import("./lib/db.js"),
    import("@mullion/llm"),
    import("./lib/db.js"),
  ]);
  await seedModelRouting(db);
  return { app: createApp() as unknown as Hono, pool, db };
}

const PASSWORD = "correct-horse-battery-staple";

// Distinct forwarded IP per harness user (TRUSTED_PROXY_HOPS=1 above) so the
// 10/min credential window is per-user, not shared across the whole run.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.99.${Math.floor(ipCounter / 200)}.${(ipCounter % 200) + 1}`;
}

/**
 * The most recent OTP mailed to `email`, read from the console email driver's
 * log. `sinceIndex` (a logLines.length snapshot taken BEFORE the triggering
 * request) scopes the search to sends caused by that request — without it,
 * two same-type sends to one address (signup + a blocked sign-in's re-send)
 * can race in the background and `at(-1)` would grab the stale, rotated-out
 * code.
 */
async function waitForOtp(email: string, sinceIndex = 0): Promise<string> {
  // The verification send may run in the background of the triggering
  // request — poll briefly instead of racing it.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const mails = logLines
      .slice(sinceIndex)
      .map((line) => {
        try {
          return JSON.parse(line) as { module?: string; to?: string; body?: string };
        } catch {
          return null;
        }
      })
      .filter((line) => line?.module === "email" && line.to === email);
    const body = mails.at(-1)?.body ?? "";
    const match = /\b(\d{6})\b/.exec(body);
    if (match?.[1]) return match[1];
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no OTP email captured for ${email}`);
}

function sessionCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("expected a session cookie");
  // Take the cookie name=value pair (drop attributes) for the request header.
  return setCookie.split(";")[0] ?? "";
}

/**
 * A signed-up, OTP-VERIFIED user's session cookie. requireEmailVerification
 * (ADR-66) means sign-up alone no longer returns a session — the OTP round
 * trip is part of what "signed up" means now.
 */
/**
 * POST /sign-up/email with a fresh identity. Sign-up used to 500
 * intermittently here — better-auth clones ctx.request for
 * sendVerificationEmail and undici's Request.clone() can throw
 * "TypeError: unusable" on an already-teed body stream; that is neutralized
 * at the composition root by src/lib/undici-clone-guard.ts (ADR-69), so no
 * retry lives here and a 500 is a real failure.
 */
async function signUpRequest(
  app: Hono,
  origin: string,
): Promise<{ res: Response; email: string; ip: string }> {
  const email = `harness-${randomUUID()}@mullion.local`;
  const ip = nextIp();
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "x-forwarded-for": ip },
    body: JSON.stringify({ name: "Harness User", email, password: PASSWORD }),
  });
  return { res, email, ip };
}

async function signUp(app: Hono): Promise<{ cookie: string; email: string; ip: string }> {
  const { res, email, ip } = await signUpRequest(app, WEB_ORIGIN);
  if (res.status !== 200) {
    throw new Error(`sign-up failed (${res.status}): ${await res.text()}`);
  }
  const otp = await waitForOtp(email);
  const verify = await app.request("/api/auth/email-otp/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": ip },
    body: JSON.stringify({ email, otp }),
  });
  if (verify.status !== 200) {
    throw new Error(`verify-email failed (${verify.status}): ${await verify.text()}`);
  }
  // autoSignInAfterVerification: the verify response carries the session.
  return { cookie: sessionCookie(verify), email, ip };
}

describe.skipIf(!integration)("apps/api HTTP surface", () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await boot();
  }, 60_000);

  afterAll(async () => {
    await harness?.pool.end();
  });

  it("serves /health without auth", async () => {
    const res = await harness.app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects an anonymous call to an org-scoped route with 401", async () => {
    const res = await harness.app.request("/api/builds");
    expect(res.status).toBe(401);
  });

  it("rejects a cross-origin state change with 403 (CSRF gate)", async () => {
    const res = await harness.app.request("/api/builds", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify({ buildSpecId: randomUUID() }),
    });
    expect(res.status).toBe(403);
  });

  it("blocks a state change whose only provenance is an evil Referer", async () => {
    // No Origin header, hostile Referer — the fallback branch of the CSRF
    // gate must reject exactly like a hostile Origin would be.
    const res = await harness.app.request("/api/builds", {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: "https://evil.example/x" },
      body: JSON.stringify({ buildSpecId: randomUUID() }),
    });
    expect(res.status).toBe(403);
  });

  it("clears the CSRF gate on an allowlisted Referer with no Origin", async () => {
    const res = await harness.app.request("/api/builds", {
      method: "POST",
      headers: { "Content-Type": "application/json", Referer: `${DASHBOARD_ORIGIN}/builds` },
      body: JSON.stringify({ buildSpecId: randomUUID() }),
    });
    // Falls through the gate to the session layer; no cookie -> 401, never 403.
    expect(res.status).toBe(401);
  });

  it("treats a malformed or absent Referer as no-provenance, never a 500 or 403", async () => {
    for (const headers of [
      { "Content-Type": "application/json", Referer: "::::not a url" },
      { "Content-Type": "application/json" }, // browser-less: no Origin/Referer
    ]) {
      const res = await harness.app.request("/api/builds", {
        method: "POST",
        headers,
        body: JSON.stringify({ buildSpecId: randomUUID() }),
      });
      expect(res.status).not.toBe(500);
      expect(res.status).not.toBe(403);
    }
  });

  it("lets an authenticated dashboard-origin mutation through to a product route", async () => {
    // The real dashboard path end to end: session cookie + Origin:
    // DASHBOARD_ORIGIN through CSRF -> session -> org middleware. A 403
    // here means one of the origin allowlists missed the dashboard.
    const { cookie } = await signUp(harness.app);
    const res = await harness.app.request("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: DASHBOARD_ORIGIN },
      body: JSON.stringify({ idea: "An origin-probe project idea for the harness." }),
    });
    expect(res.status).not.toBe(403);
    expect([200, 201]).toContain(res.status);
  });

  it("accepts state changes from both browser origins (ADR-64)", async () => {
    // The dashboard is a second first-class client: a mutation carrying its
    // Origin must clear the CSRF gate and Better Auth's trustedOrigins the
    // same way the marketing origin does. 403 here means one of the three
    // allowlists (CORS / CSRF gate / trustedOrigins) missed the update.
    for (const origin of [WEB_ORIGIN, DASHBOARD_ORIGIN]) {
      // signUpRequest hands each attempt a distinct forwarded IP, so this
      // never shares (or flakes on) the cred:unknown rate-limit bucket.
      const { res } = await signUpRequest(harness.app, origin);
      expect(res.status, `sign-up from ${origin}`).toBe(200);
    }
  });

  it("echoes each allowlisted origin in CORS preflight, never unknown ones", async () => {
    for (const origin of [WEB_ORIGIN, DASHBOARD_ORIGIN]) {
      const res = await harness.app.request("/api/builds", {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
        },
      });
      expect(res.headers.get("access-control-allow-origin"), `preflight from ${origin}`).toBe(origin);
      expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    }
    const evil = await harness.app.request("/api/builds", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("blocks GitHub as a SIGN-IN method (ADR-35/56)", async () => {
    // The auth before-hook must reject /sign-in/social provider=github
    // regardless of whether a GitHub OAuth app is configured — link-only.
    const res = await harness.app.request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": nextIp() },
      body: JSON.stringify({ provider: "github", callbackURL: "/" }),
    });
    expect(res.status).toBe(403);
    // Prove it's the ADR-56 guard's 403, not the CSRF gate's or a generic one.
    expect(await res.text()).toMatch(/link-only/);
  });

  it("signs a user up, provisions a personal org, and serves their (empty) builds", async () => {
    const { cookie } = await signUp(harness.app);
    // A protected, org-scoped route with the session cookie exercises the
    // full session → requireOrgMember → route chain end to end.
    const res = await harness.app.request("/api/builds", {
      method: "GET",
      headers: { Cookie: cookie, Origin: WEB_ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("does not create a user from an OAuth callback with no valid state", async () => {
    // A bare GitHub callback (no session, no valid state) must not mint an
    // account — the link-only guarantee (ADR-56) depends on this.
    const res = await harness.app.request("/api/auth/callback/github?code=fake&state=fake", {
      method: "GET",
      headers: { Origin: WEB_ORIGIN },
    });
    // Better Auth rejects/redirects; the load-bearing assertion is simply
    // that it never returns a freshly-authenticated 200 session.
    expect(res.status).not.toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("does not catch Google in the GitHub sign-in guard", async () => {
    // No Google OAuth app is configured in the harness env, so Better Auth
    // rejects the provider — the load-bearing assertion is that the ADR-56
    // guard's 403 never fires for a non-github provider.
    const res = await harness.app.request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": nextIp() },
      body: JSON.stringify({ provider: "google", callbackURL: "/" }),
    });
    expect(res.status).not.toBe(403);
  });

  it("blocks credential sign-in until the email is OTP-verified (ADR-66)", async () => {
    const { res: signup, email, ip } = await signUpRequest(harness.app, WEB_ORIGIN);
    const headers = { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": ip };
    expect(signup.status).toBe(200);

    // Pre-verification sign-in must be refused, and (sendOnSignIn) must
    // re-send a fresh OTP so a returning user isn't stuck on an expired code.
    const beforeBlocked = logLines.length;
    const blocked = await harness.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get("set-cookie")).toBeNull();

    // A wrong code is rejected without flipping the flag… (scoped past the
    // signup send: rotate strategy means only the re-sent code is live)
    const otp = await waitForOtp(email, beforeBlocked);
    const wrongOtp = otp === "000000" ? "000001" : "000000";
    const wrong = await harness.app.request("/api/auth/email-otp/verify-email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, otp: wrongOtp }),
    });
    expect(wrong.status).not.toBe(200);

    // …the right one verifies and signs in (autoSignInAfterVerification).
    const verify = await harness.app.request("/api/auth/email-otp/verify-email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, otp }),
    });
    expect(verify.status).toBe(200);
    expect(verify.headers.get("set-cookie")).not.toBeNull();

    // And the password now works.
    const signin = await harness.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(signin.status).toBe(200);
  });

  it("resets a password via OTP and revokes the old credentials", async () => {
    const { email, ip } = await signUp(harness.app);
    const headers = { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": ip };
    const request = await harness.app.request("/api/auth/email-otp/request-password-reset", {
      method: "POST",
      headers,
      body: JSON.stringify({ email }),
    });
    expect(request.status).toBe(200);

    const otp = await waitForOtp(email);
    const newPassword = "an-entirely-new-passphrase";
    const reset = await harness.app.request("/api/auth/email-otp/reset-password", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, otp, password: newPassword }),
    });
    expect(reset.status).toBe(200);

    const oldSignin = await harness.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(oldSignin.status).toBe(401);

    const newSignin = await harness.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: newPassword }),
    });
    expect(newSignin.status).toBe(200);
  });

  it("revokes every pre-reset session when the password is reset", async () => {
    // revokeSessionsOnPasswordReset — a compromise reset must log the
    // attacker (and everyone else) out, not just change the password.
    const { cookie, email, ip } = await signUp(harness.app);
    const headers = { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": ip };
    const before = logLines.length;
    await harness.app.request("/api/auth/email-otp/request-password-reset", {
      method: "POST",
      headers,
      body: JSON.stringify({ email }),
    });
    const otp = await waitForOtp(email, before);
    const reset = await harness.app.request("/api/auth/email-otp/reset-password", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, otp, password: "post-compromise-passphrase" }),
    });
    expect(reset.status).toBe(200);

    const withOldSession = await harness.app.request("/api/builds", {
      method: "GET",
      headers: { Cookie: cookie, Origin: WEB_ORIGIN, "x-forwarded-for": ip },
    });
    expect(withOldSession.status).toBe(401);
  });

  it("invalidates the code after 3 wrong attempts (allowedAttempts)", async () => {
    const { res: signup, email, ip } = await signUpRequest(harness.app, WEB_ORIGIN);
    const headers = { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": ip };
    expect(signup.status).toBe(200);
    const otp = await waitForOtp(email);
    for (const wrong of ["000000", "111111", "222222"]) {
      const res = await harness.app.request("/api/auth/email-otp/verify-email", {
        method: "POST",
        headers,
        body: JSON.stringify({ email, otp: wrong === otp ? "999999" : wrong }),
      });
      expect(res.status).not.toBe(200);
    }
    // The correct code is burned now — brute-forcing 3 guesses must not
    // leave the real code usable.
    const afterCap = await harness.app.request("/api/auth/email-otp/verify-email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, otp }),
    });
    expect(afterCap.status).not.toBe(200);
  });

  it("signs a passwordless (social-first) account in via OTP end to end (ADR-66)", async () => {
    // The happy half of the password-presence gate: a user with NO
    // credential row (normally minted by OAuth — seeded directly here since
    // the harness has no live OAuth provider) must be able to request a
    // sign-in code and complete OTP sign-in.
    const { schema } = await import("@mullion/db");
    const { provisionPersonalOrg } = await import("./modules/auth/org.js");
    const email = `passwordless-${randomUUID()}@mullion.local`;
    const userId = randomUUID();
    const [user] = await harness.db
      .insert(schema.user)
      .values({ id: userId, name: "Social First", email, emailVerified: true })
      .returning();
    if (!user) throw new Error("seed insert returned no user row");
    await provisionPersonalOrg(harness.db, user);

    const ip = nextIp();
    const headers = { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": ip };
    const before = logLines.length;
    const send = await harness.app.request("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, type: "sign-in" }),
    });
    expect(send.status).toBe(200);

    const otp = await waitForOtp(email, before);
    const signin = await harness.app.request("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, otp }),
    });
    expect(signin.status).toBe(200);
    const cookie = sessionCookie(signin);

    // The session is real: it clears the org-scoped product surface.
    const builds = await harness.app.request("/api/builds", {
      method: "GET",
      headers: { Cookie: cookie, Origin: WEB_ORIGIN, "x-forwarded-for": ip },
    });
    expect(builds.status).toBe(200);
  });

  it("recovers a social-first account through forgot-password, provisioning its first credential (ADR-68)", async () => {
    // The one recovery door: a user with NO credential row goes through the
    // stock request-password-reset -> reset-password flow, which CREATES a
    // credential account (verified against Better Auth 1.6.23 source). They
    // must end up able to sign in with the new password.
    const { schema } = await import("@mullion/db");
    const { provisionPersonalOrg } = await import("./modules/auth/org.js");
    const email = `social-recovery-${randomUUID()}@mullion.local`;
    const [user] = await harness.db
      .insert(schema.user)
      .values({ id: randomUUID(), name: "Social Recovery", email, emailVerified: true })
      .returning();
    if (!user) throw new Error("seed insert returned no user row");
    await provisionPersonalOrg(harness.db, user);

    const ip = nextIp();
    const headers = { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": ip };
    const before = logLines.length;
    const request = await harness.app.request("/api/auth/email-otp/request-password-reset", {
      method: "POST",
      headers,
      body: JSON.stringify({ email }),
    });
    expect(request.status).toBe(200);

    const otp = await waitForOtp(email, before);
    const newPassword = "first-ever-passphrase";
    const reset = await harness.app.request("/api/auth/email-otp/reset-password", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, otp, password: newPassword }),
    });
    expect(reset.status).toBe(200);

    // The provisioned credential is real: password sign-in now works...
    const signin = await harness.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: newPassword }),
    });
    expect(signin.status).toBe(200);
    expect(sessionCookie(signin)).toBeTruthy();

    // ...and the account is now credentialed, so the ADR-66 guard closes the
    // passwordless path behind it.
    const otpSend = await harness.app.request("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, type: "sign-in" }),
    });
    expect(otpSend.status).toBe(403);
    // Pin the 403 to the ADR-66 guard specifically, not some other layer.
    expect(await otpSend.text()).toMatch(/has a password/);
  });

  it("answers password-reset requests identically for unknown emails (no enumeration oracle)", async () => {
    const { email, ip } = await signUp(harness.app);
    const headers = { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": ip };
    const known = await harness.app.request("/api/auth/email-otp/request-password-reset", {
      method: "POST",
      headers,
      body: JSON.stringify({ email }),
    });
    const unknown = await harness.app.request("/api/auth/email-otp/request-password-reset", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: `nobody-${randomUUID()}@mullion.local` }),
    });
    expect(unknown.status).toBe(known.status);
    expect(await unknown.text()).toBe(await known.text());
  });

  it("refuses OTP sign-in for accounts that have a password (ADR-66)", async () => {
    const { email, ip } = await signUp(harness.app);
    const headers = { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": ip };
    // Neither the code email nor the sign-in itself may proceed — the empty
    // password field is the flag, and this account has one.
    const send = await harness.app.request("/api/auth/email-otp/send-verification-otp", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, type: "sign-in" }),
    });
    expect(send.status).toBe(403);
    expect(await send.text()).toMatch(/has a password/);
    const signin = await harness.app.request("/api/auth/sign-in/email-otp", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, otp: "000000" }),
    });
    expect(signin.status).toBe(403);
    expect(await signin.text()).toMatch(/has a password/);
  });

  it("rejects set-password for an account that already has one (409)", async () => {
    const { cookie, ip } = await signUp(harness.app);
    const res = await harness.app.request("/api/account/set-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: DASHBOARD_ORIGIN,
        "x-forwarded-for": ip,
      },
      body: JSON.stringify({ newPassword: "some-other-passphrase" }),
    });
    expect(res.status).toBe(409);
  });

  it("updates the avatar through update-user, https URLs only (ADR-66)", async () => {
    const { cookie, ip } = await signUp(harness.app);
    const headers = {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: DASHBOARD_ORIGIN,
      "x-forwarded-for": ip,
    };
    const bad = await harness.app.request("/api/auth/update-user", {
      method: "POST",
      headers,
      body: JSON.stringify({ image: "javascript:alert(1)" }),
    });
    expect(bad.status).toBe(400);

    const good = await harness.app.request("/api/auth/update-user", {
      method: "POST",
      headers,
      body: JSON.stringify({ image: "https://avatars.example.com/u/1.png" }),
    });
    expect(good.status).toBe(200);

    const session = await harness.app.request("/api/auth/get-session", {
      method: "GET",
      headers: { Cookie: cookie, Origin: DASHBOARD_ORIGIN, "x-forwarded-for": ip },
    });
    const body = (await session.json()) as { user?: { image?: string | null } };
    expect(body.user?.image).toBe("https://avatars.example.com/u/1.png");
  });

  it("rate-limits the OTP endpoints on the credential window (ADR-32/66)", async () => {
    const ip = nextIp();
    const headers = { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": ip };
    let limited = false;
    for (let i = 0; i < 12; i += 1) {
      const res = await harness.app.request("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers,
        body: JSON.stringify({ email: `flood-${randomUUID()}@mullion.local`, type: "email-verification" }),
      });
      if (res.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  describe("settings: BYOK + model overrides + analytics (ADR-70/71)", () => {
    const TEST_KEY = "sk-or-v1-harness-key-000000000000abcd";

    function authedHeaders(cookie: string, ip: string): Record<string, string> {
      return {
        "Content-Type": "application/json",
        Cookie: cookie,
        Origin: DASHBOARD_ORIGIN,
        "x-forwarded-for": ip,
      };
    }

    /** Stub the outbound OpenRouter probe — never a live call from a test. */
    async function stubValidateKey(valid: boolean): Promise<{ mockRestore: () => void }> {
      const { llm } = await import("./lib/llm.js");
      return vi.spyOn(llm, "validateKey").mockResolvedValue({ valid });
    }

    async function orgIdForCookie(cookie: string, ip: string): Promise<string> {
      const res = await harness.app.request("/api/auth/get-session", {
        method: "GET",
        headers: { Cookie: cookie, Origin: DASHBOARD_ORIGIN, "x-forwarded-for": ip },
      });
      const body = (await res.json()) as { session?: { activeOrganizationId?: string | null } };
      if (!body.session?.activeOrganizationId) {
        throw new Error("session has no active organization");
      }
      return body.session.activeOrganizationId;
    }

    it("rejects anonymous access on every settings route", async () => {
      for (const path of ["/api/settings/byok", "/api/settings/models", "/api/settings/analytics"]) {
        const res = await harness.app.request(path);
        expect(res.status).toBe(401);
      }
    });

    it("refuses to persist a key OpenRouter rejects", async () => {
      const { cookie, ip } = await signUp(harness.app);
      const spy = await stubValidateKey(false);
      try {
        const res = await harness.app.request("/api/settings/byok", {
          method: "POST",
          headers: authedHeaders(cookie, ip),
          body: JSON.stringify({ apiKey: TEST_KEY }),
        });
        expect(res.status).toBe(400);
        const status = await harness.app.request("/api/settings/byok", {
          headers: authedHeaders(cookie, ip),
        });
        expect(await status.json()).toMatchObject({ hasKey: false });
      } finally {
        spy.mockRestore();
      }
    });

    it("saves a valid key, returns only the masked tail, and gates model overrides on it", async () => {
      const { cookie, ip } = await signUp(harness.app);
      const headers = authedHeaders(cookie, ip);

      // Custom pick before any key exists → 409 (ADR-71: platform pays, platform picks).
      const early = await harness.app.request("/api/settings/models", {
        method: "PUT",
        headers,
        body: JSON.stringify({ role: "coder", modelSlug: "anthropic/claude-haiku-4.5" }),
      });
      expect(early.status).toBe(409);

      const spy = await stubValidateKey(true);
      try {
        const save = await harness.app.request("/api/settings/byok", {
          method: "POST",
          headers,
          body: JSON.stringify({ apiKey: TEST_KEY }),
        });
        expect(save.status).toBe(200);
        const saveBody = (await save.json()) as { keyLast4: string };
        expect(saveBody.keyLast4).toBe(TEST_KEY.slice(-4));

        const status = await harness.app.request("/api/settings/byok", { headers });
        const statusBody = JSON.stringify(await status.json());
        expect(statusBody).toContain(TEST_KEY.slice(-4));
        // The plaintext key must never come back in any response (ADR-70).
        expect(statusBody).not.toContain(TEST_KEY);

        // Foreign slug → 400 even with a key (ADR-71 allowlist).
        const foreign = await harness.app.request("/api/settings/models", {
          method: "PUT",
          headers,
          body: JSON.stringify({ role: "coder", modelSlug: "evil/model" }),
        });
        expect(foreign.status).toBe(400);

        // Allowlisted slug → saved and visible in GET /models.
        const put = await harness.app.request("/api/settings/models", {
          method: "PUT",
          headers,
          body: JSON.stringify({ role: "coder", modelSlug: "anthropic/claude-haiku-4.5" }),
        });
        expect(put.status).toBe(200);
        const models = (await (
          await harness.app.request("/api/settings/models", { headers })
        ).json()) as {
          byokEnabled: boolean;
          roles: Array<{ role: string; overrideModelSlug: string | null }>;
        };
        expect(models.byokEnabled).toBe(true);
        expect(models.roles.find((r) => r.role === "coder")?.overrideModelSlug).toBe(
          "anthropic/claude-haiku-4.5",
        );

        // "Platform default" (null) deletes the override row.
        const revert = await harness.app.request("/api/settings/models", {
          method: "PUT",
          headers,
          body: JSON.stringify({ role: "coder", modelSlug: null }),
        });
        expect(revert.status).toBe(200);

        // Removing the key flips byokEnabled off for the models surface.
        const del = await harness.app.request("/api/settings/byok", {
          method: "DELETE",
          headers,
        });
        expect(del.status).toBe(200);
        const after = (await (
          await harness.app.request("/api/settings/models", { headers })
        ).json()) as { byokEnabled: boolean };
        expect(after.byokEnabled).toBe(false);
      } finally {
        spy.mockRestore();
      }
    });

    it("aggregates cost events per role and per day, org-scoped", async () => {
      const { cookie, ip } = await signUp(harness.app);
      const headers = authedHeaders(cookie, ip);
      const organizationId = await orgIdForCookie(cookie, ip);

      const { schema } = await import("@mullion/db");
      await harness.db.insert(schema.costEvents).values([
        {
          organizationId,
          source: "llm",
          role: "coder",
          modelSlug: "anthropic/claude-haiku-4.5",
          cost: "0.01000000",
          byok: false,
          promptTokens: 100,
          completionTokens: 50,
        },
        {
          organizationId,
          source: "llm",
          role: "reviewer",
          modelSlug: "anthropic/claude-sonnet-4.5",
          cost: "0.02000000",
          byok: true,
          promptTokens: 200,
          completionTokens: 80,
        },
      ]);

      const res = await harness.app.request("/api/settings/analytics?days=7", { headers });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        totals: { costUsd: number; byokCostUsd: number; promptTokens: number; completionTokens: number; llmCalls: number };
        byRole: Array<{ role: string; promptTokens: number }>;
        byDay: Array<{ day: string }>;
      };
      expect(body.totals.costUsd).toBeCloseTo(0.03, 8);
      expect(body.totals.byokCostUsd).toBeCloseTo(0.02, 8);
      expect(body.totals.promptTokens).toBe(300);
      expect(body.totals.completionTokens).toBe(130);
      expect(body.totals.llmCalls).toBe(2);
      expect(body.byRole.map((r) => r.role).sort()).toEqual(["coder", "reviewer"]);
      expect(body.byDay.length).toBe(1);

      // A second org sees none of it (ADR-36 tenancy).
      const other = await signUp(harness.app);
      const otherRes = await harness.app.request("/api/settings/analytics?days=7", {
        headers: authedHeaders(other.cookie, other.ip),
      });
      const otherBody = (await otherRes.json()) as { totals: { llmCalls: number } };
      expect(otherBody.totals.llmCalls).toBe(0);
    });

    it("excludes BYOK spend from the org budget window but not the per-run ceiling (ADR-70)", async () => {
      const { cookie, ip } = await signUp(harness.app);
      const organizationId = await orgIdForCookie(cookie, ip);
      const { schema } = await import("@mullion/db");
      const { checkBudget } = await import("@mullion/agents");

      await harness.db.insert(schema.costEvents).values([
        { organizationId, source: "llm", role: "coder", cost: "5.00000000", byok: true },
        { organizationId, source: "llm", role: "coder", cost: "5.00000000", byok: false },
      ]);

      // Org window sees only the platform-billed $5 — under the $8 ceiling.
      const ok = await checkBudget(harness.db, {
        organizationId,
        config: { orgBudgetUsd: 8 },
      });
      expect(ok.ok).toBe(true);
      expect(ok.spentUsd).toBeCloseTo(5, 6);

      // Drop the ceiling below the platform-billed spend — now it trips.
      const tripped = await checkBudget(harness.db, {
        organizationId,
        config: { orgBudgetUsd: 4 },
      });
      expect(tripped.ok).toBe(false);
      expect(tripped.scope).toBe("org");
    });

    it("validates analytics bounds and model-override roles", async () => {
      const { cookie, ip } = await signUp(harness.app);
      const headers = authedHeaders(cookie, ip);

      for (const q of ["days=0", "days=91", "days=abc"]) {
        const res = await harness.app.request(`/api/settings/analytics?${q}`, { headers });
        expect(res.status).toBe(400);
      }
      const defaulted = await harness.app.request("/api/settings/analytics", { headers });
      expect(defaulted.status).toBe(200);
      expect(((await defaulted.json()) as { days: number }).days).toBe(30);

      const badRole = await harness.app.request("/api/settings/models", {
        method: "PUT",
        headers,
        body: JSON.stringify({ role: "wizard", modelSlug: null }),
      });
      expect(badRole.status).toBe(400);
    });

    it("rate-limits key saves on a strict per-user window (ADR-70)", async () => {
      const { cookie, ip } = await signUp(harness.app);
      const spy = await stubValidateKey(true);
      try {
        let limited = false;
        for (let i = 0; i < 7; i += 1) {
          const res = await harness.app.request("/api/settings/byok", {
            method: "POST",
            headers: authedHeaders(cookie, ip),
            body: JSON.stringify({ apiKey: TEST_KEY }),
          });
          if (res.status === 429) {
            limited = true;
            break;
          }
        }
        expect(limited).toBe(true);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("org RBAC: roles, invites, last-admin (ADR-72)", () => {
    interface HarnessUser {
      cookie: string;
      email: string;
      ip: string;
    }

    function orgHeaders(user: HarnessUser): Record<string, string> {
      return {
        "Content-Type": "application/json",
        Cookie: user.cookie,
        Origin: DASHBOARD_ORIGIN,
        "x-forwarded-for": user.ip,
      };
    }

    /** The invitation id from the invite email's accept URL (console driver). */
    async function waitForInviteId(email: string, sinceIndex = 0): Promise<string> {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const mails = logLines
          .slice(sinceIndex)
          .map((line) => {
            try {
              return JSON.parse(line) as { module?: string; to?: string; body?: string };
            } catch {
              return null;
            }
          })
          .filter((line) => line?.module === "email" && line.to === email);
        const body = mails.at(-1)?.body ?? "";
        const match = /\/invite\/([A-Za-z0-9_-]+)/.exec(body);
        if (match?.[1]) return match[1];
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`no invite email captured for ${email}`);
    }

    async function activeOrgId(user: HarnessUser): Promise<string> {
      const res = await harness.app.request("/api/auth/get-session", {
        method: "GET",
        headers: orgHeaders(user),
      });
      const body = (await res.json()) as { session?: { activeOrganizationId?: string | null } };
      if (!body.session?.activeOrganizationId) {
        throw new Error("session has no active organization");
      }
      return body.session.activeOrganizationId;
    }

    async function invite(
      admin: HarnessUser,
      email: string,
      role: string,
    ): Promise<{ res: Response; invitationId?: string }> {
      const before = logLines.length;
      const res = await harness.app.request("/api/auth/organization/invite-member", {
        method: "POST",
        headers: orgHeaders(admin),
        body: JSON.stringify({ email, role }),
      });
      if (res.status !== 200) return { res };
      return { res, invitationId: await waitForInviteId(email, before) };
    }

    async function accept(user: HarnessUser, invitationId: string): Promise<Response> {
      return harness.app.request("/api/auth/organization/accept-invitation", {
        method: "POST",
        headers: orgHeaders(user),
        body: JSON.stringify({ invitationId }),
      });
    }

    async function membersOf(
      user: HarnessUser,
    ): Promise<{
      canManage: boolean;
      members: Array<{ id: string; email: string; role: string }>;
      invitations: Array<{ id: string; status: string }>;
    }> {
      const res = await harness.app.request("/api/org/members", { headers: orgHeaders(user) });
      expect(res.status).toBe(200);
      return (await res.json()) as never;
    }

    it("runs the full invite lifecycle: preview, accept, member limits, leave", async () => {
      const admin = await signUp(harness.app);
      const invitee = await signUp(harness.app);
      const inviteePersonalOrg = await activeOrgId(invitee);
      const teamOrg = await activeOrgId(admin);

      const { res, invitationId } = await invite(admin, invitee.email, "member");
      expect(res.status).toBe(200);
      if (!invitationId) throw new Error("no invitation id");

      // Preview is deliberately unauthenticated — no cookie at all.
      const preview = await harness.app.request(`/api/org/invitations/${invitationId}/preview`);
      expect(preview.status).toBe(200);
      expect(await preview.json()).toMatchObject({
        status: "pending",
        invitedEmail: invitee.email,
        inviterName: "Harness User",
      });

      expect((await accept(invitee, invitationId)).status).toBe(200);

      // Coexist-and-switch: accepting adds a membership, it does not steal
      // the active org — the deterministic default stays the personal org.
      expect(await activeOrgId(invitee)).toBe(inviteePersonalOrg);

      const adminView = await membersOf(admin);
      expect(adminView.canManage).toBe(true);
      expect(adminView.members).toHaveLength(2);
      expect(adminView.invitations.some((i) => i.status === "accepted")).toBe(true);

      // Switch into the team org; a plain member reads but cannot manage.
      const setActive = await harness.app.request("/api/auth/organization/set-active", {
        method: "POST",
        headers: orgHeaders(invitee),
        body: JSON.stringify({ organizationId: teamOrg }),
      });
      expect(setActive.status).toBe(200);
      const memberView = await membersOf(invitee);
      expect(memberView.canManage).toBe(false);
      const adminMemberId = adminView.members.find((m) => m.email === admin.email)?.id;
      const forbidden = await harness.app.request(`/api/org/members/${adminMemberId}`, {
        method: "PATCH",
        headers: orgHeaders(invitee),
        body: JSON.stringify({ role: "member" }),
      });
      expect(forbidden.status).toBe(403);

      // A non-admin can leave; the roster shrinks back.
      const leave = await harness.app.request("/api/org/leave", {
        method: "POST",
        headers: orgHeaders(invitee),
      });
      expect(leave.status).toBe(200);
      expect((await membersOf(admin)).members).toHaveLength(1);
      // The leaver's healed session lands back on the personal org.
      expect(await activeOrgId(invitee)).toBe(inviteePersonalOrg);
    });

    it("accepts via sign-up when the invited address has no account yet", async () => {
      const admin = await signUp(harness.app);
      const email = `harness-${randomUUID()}@mullion.local`;
      const { res, invitationId } = await invite(admin, email, "member");
      expect(res.status).toBe(200);
      if (!invitationId) throw new Error("no invitation id");

      // Sign up with exactly the invited address, then accept.
      const ip = nextIp();
      const beforeSignup = logLines.length;
      const signup = await harness.app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": ip },
        body: JSON.stringify({ name: "Invited User", email, password: PASSWORD }),
      });
      expect(signup.status).toBe(200);
      const otp = await waitForOtp(email, beforeSignup);
      const verify = await harness.app.request("/api/auth/email-otp/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN, "x-forwarded-for": ip },
        body: JSON.stringify({ email, otp }),
      });
      expect(verify.status).toBe(200);
      const invitedUser: HarnessUser = { cookie: sessionCookie(verify), email, ip };

      expect((await accept(invitedUser, invitationId)).status).toBe(200);
      expect((await membersOf(admin)).members).toHaveLength(2);
    });

    it("rejects role smuggling, wrong-email accepts, expiry, and reflects revocation", async () => {
      const admin = await signUp(harness.app);
      const bystander = await signUp(harness.app);

      // Role-enum guard: the retired owner role and comma-joined lists die
      // in beforeCreateInvitation regardless of caller.
      for (const role of ["owner", "admin,member"]) {
        const smuggled = await invite(admin, `smuggle-${randomUUID()}@mullion.local`, role);
        expect(smuggled.res.status).toBe(400);
      }

      // Wrong email: the invite belongs to someone else's address.
      const target = `target-${randomUUID()}@mullion.local`;
      const wrongEmail = await invite(admin, target, "member");
      expect(wrongEmail.res.status).toBe(200);
      if (!wrongEmail.invitationId) throw new Error("no invitation id");
      const stolen = await accept(bystander, wrongEmail.invitationId);
      expect(stolen.status).toBeGreaterThanOrEqual(400);

      // Expiry is enforced at accept time and derived in the preview.
      const { schema } = await import("@mullion/db");
      const { eq } = await import("drizzle-orm");
      await harness.db
        .update(schema.invitation)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(schema.invitation.id, wrongEmail.invitationId));
      const expiredPreview = await harness.app.request(
        `/api/org/invitations/${wrongEmail.invitationId}/preview`,
      );
      expect(await expiredPreview.json()).toMatchObject({ status: "expired" });

      // Revoke (cancel) a fresh invite; preview reports it terminally.
      const revokable = await invite(admin, `revoke-${randomUUID()}@mullion.local`, "member");
      if (!revokable.invitationId) throw new Error("no invitation id");
      const cancel = await harness.app.request("/api/auth/organization/cancel-invitation", {
        method: "POST",
        headers: orgHeaders(admin),
        body: JSON.stringify({ invitationId: revokable.invitationId }),
      });
      expect(cancel.status).toBe(200);
      const revokedPreview = await harness.app.request(
        `/api/org/invitations/${revokable.invitationId}/preview`,
      );
      expect(await revokedPreview.json()).toMatchObject({ status: "revoked" });
    });

    it("never lets an org drop to zero admins", async () => {
      const admin = await signUp(harness.app);
      const roster = await membersOf(admin);
      const selfId = roster.members[0]?.id;
      if (!selfId) throw new Error("no member row");

      // Sole admin: demote, remove, and leave are all blocked.
      const demote = await harness.app.request(`/api/org/members/${selfId}`, {
        method: "PATCH",
        headers: orgHeaders(admin),
        body: JSON.stringify({ role: "member" }),
      });
      expect(demote.status).toBe(409);
      const remove = await harness.app.request(`/api/org/members/${selfId}`, {
        method: "DELETE",
        headers: orgHeaders(admin),
      });
      expect(remove.status).toBe(409);
      // Leaving the personal org is refused outright, last admin or not.
      const leave = await harness.app.request("/api/org/leave", {
        method: "POST",
        headers: orgHeaders(admin),
      });
      expect(leave.status).toBe(400);

      // With a second admin on the roster, the same demote succeeds.
      const second = await signUp(harness.app);
      const { invitationId } = await invite(admin, second.email, "admin");
      if (!invitationId) throw new Error("no invitation id");
      expect((await accept(second, invitationId)).status).toBe(200);
      const demoteWithBackup = await harness.app.request(`/api/org/members/${selfId}`, {
        method: "PATCH",
        headers: orgHeaders(admin),
        body: JSON.stringify({ role: "member" }),
      });
      expect(demoteWithBackup.status).toBe(200);
    });

    it("dead-ends the Better Auth bypass endpoints for roster mutations", async () => {
      const user = await signUp(harness.app);
      for (const path of [
        "/api/auth/organization/leave",
        "/api/auth/organization/remove-member",
        "/api/auth/organization/update-member-role",
      ]) {
        const res = await harness.app.request(path, {
          method: "POST",
          headers: orgHeaders(user),
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(404);
      }
    });

    it("scopes member ids to the caller's active org (cross-org 404)", async () => {
      const orgA = await signUp(harness.app);
      const orgB = await signUp(harness.app);
      const aMemberId = (await membersOf(orgA)).members[0]?.id;
      // orgB is an admin — of their OWN org; someone else's member id must 404.
      const res = await harness.app.request(`/api/org/members/${aMemberId}`, {
        method: "PATCH",
        headers: orgHeaders(orgB),
        body: JSON.stringify({ role: "member" }),
      });
      expect(res.status).toBe(404);
    });

    it("keeps legacy owner rows managing during the migration window", async () => {
      const user = await signUp(harness.app);
      const { schema } = await import("@mullion/db");
      const { eq } = await import("drizzle-orm");
      const orgId = await activeOrgId(user);
      await harness.db
        .update(schema.member)
        .set({ role: "owner" })
        .where(eq(schema.member.organizationId, orgId));
      const view = await membersOf(user);
      expect(view.canManage).toBe(true);
      // The migration rewrite is exactly what 0009 runs in production.
      await harness.db
        .update(schema.member)
        .set({ role: "admin" })
        .where(eq(schema.member.role, "owner"));
      expect((await membersOf(user)).members[0]?.role).toBe("admin");
    });
  });
});
