import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Hono } from "hono";

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
const WEB_ORIGIN = "http://localhost:3000";

interface Harness {
  app: Hono;
  pool: { end: () => Promise<void> };
}

async function boot(): Promise<Harness> {
  process.env["NODE_ENV"] ??= "test";
  process.env["BETTER_AUTH_SECRET"] ??= "test-secret-at-least-32-characters-long-000";
  process.env["API_ORIGIN"] ??= "http://localhost:8787";
  process.env["WEB_ORIGIN"] ??= WEB_ORIGIN;
  process.env["OPENROUTER_API_KEY"] ??= "test-key";
  // DATABASE_URL is deliberately NOT defaulted — the test needs a real one.
  const [{ createApp }, { pool }, { seedModelRouting }, { db }] = await Promise.all([
    import("./app.js"),
    import("./lib/db.js"),
    import("@mullion/llm"),
    import("./lib/db.js"),
  ]);
  await seedModelRouting(db);
  return { app: createApp() as unknown as Hono, pool };
}

/** A signed-up user's session cookie, for authenticated requests. */
async function signUp(app: Hono): Promise<{ cookie: string; email: string }> {
  const email = `harness-${randomUUID()}@mullion.local`;
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN },
    body: JSON.stringify({ name: "Harness User", email, password: "correct-horse-battery-staple" }),
  });
  if (res.status !== 200) {
    throw new Error(`sign-up failed (${res.status}): ${await res.text()}`);
  }
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up returned no session cookie");
  // Take the cookie name=value pair (drop attributes) for the request header.
  const cookie = setCookie.split(";")[0] ?? "";
  return { cookie, email };
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

  it("blocks GitHub as a SIGN-IN method (ADR-35/56)", async () => {
    // The auth before-hook must reject /sign-in/social provider=github
    // regardless of whether a GitHub OAuth app is configured — link-only.
    const res = await harness.app.request("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN },
      body: JSON.stringify({ provider: "github", callbackURL: "/" }),
    });
    expect(res.status).toBe(403);
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
});
