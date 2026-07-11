import { describe, expect, it } from "vitest";
import { parseApiEnv } from "./env.js";

/**
 * The LOG_FORMAT default decides whether pino-pretty's worker-thread
 * transport spawns (ADR-63) — pretty is development-only; test and
 * production must resolve to json.
 */
const BASE = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
  API_ORIGIN: "http://localhost:8787",
  WEB_ORIGIN: "http://localhost:3000",
  DASHBOARD_ORIGIN: "http://localhost:3001",
  OPENROUTER_API_KEY: "test-key",
};

describe("logging env (ADR-63)", () => {
  it("defaults LOG_FORMAT to pretty only in development", () => {
    expect(parseApiEnv({ ...BASE, NODE_ENV: "development" }).LOG_FORMAT).toBe("pretty");
    expect(parseApiEnv({ ...BASE, NODE_ENV: "test" }).LOG_FORMAT).toBe("json");
  });

  it("keeps an explicit LOG_FORMAT through the transform", () => {
    expect(parseApiEnv({ ...BASE, NODE_ENV: "development", LOG_FORMAT: "json" }).LOG_FORMAT).toBe(
      "json",
    );
    expect(parseApiEnv({ ...BASE, NODE_ENV: "test", LOG_FORMAT: "pretty" }).LOG_FORMAT).toBe(
      "pretty",
    );
  });

  it("defaults LOG_LEVEL to info and rejects unknown levels", () => {
    expect(parseApiEnv({ ...BASE }).LOG_LEVEL).toBe("info");
    expect(parseApiEnv({ ...BASE, LOG_LEVEL: "debug" }).LOG_LEVEL).toBe("debug");
    expect(() => parseApiEnv({ ...BASE, LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
  });
});

/**
 * DASHBOARD_ORIGIN is a second browser client of the API (ADR-64) — it must
 * be present and, like the other two origins, https in production so the
 * session cookie's Secure flag holds across the whole topology.
 */
describe("dashboard origin (ADR-64)", () => {
  it("requires DASHBOARD_ORIGIN", () => {
    const { DASHBOARD_ORIGIN: _omitted, ...withoutDashboard } = BASE;
    expect(() => parseApiEnv(withoutDashboard)).toThrow(/DASHBOARD_ORIGIN/);
  });

  it("rejects a non-URL DASHBOARD_ORIGIN", () => {
    expect(() => parseApiEnv({ ...BASE, DASHBOARD_ORIGIN: "not-a-url" })).toThrow(
      /DASHBOARD_ORIGIN/,
    );
  });

  it("requires https DASHBOARD_ORIGIN in production", () => {
    const prod = {
      ...BASE,
      NODE_ENV: "production",
      DATABASE_URL: "postgres://user:pass@host/db?sslmode=require",
      API_ORIGIN: "https://api.example.com",
      WEB_ORIGIN: "https://example.com",
      // Production pins EMAIL_DRIVER=resend (ADR-67) — satisfy it so this
      // test only exercises the origin guard.
      EMAIL_DRIVER: "resend",
      RESEND_API_KEY: "re_x",
      EMAIL_FROM: "Mullion <auth@mullion.dev>",
    };
    expect(() => parseApiEnv({ ...prod, DASHBOARD_ORIGIN: "http://app.example.com" })).toThrow(
      /DASHBOARD_ORIGIN/,
    );
    expect(
      parseApiEnv({ ...prod, DASHBOARD_ORIGIN: "https://app.example.com" }).DASHBOARD_ORIGIN,
    ).toBe("https://app.example.com");
  });
});

describe("origin normalization", () => {
  it("normalizes origins to URL.origin (case, default port, trailing slash)", () => {
    const parsed = parseApiEnv({
      ...BASE,
      API_ORIGIN: "http://LOCALHOST:8787/",
      WEB_ORIGIN: "http://localhost:3000/some/path",
      DASHBOARD_ORIGIN: "http://localhost:3001/",
    });
    // Exact-string matched against browser-normalized Origin headers by the
    // CSRF gate and CORS — a stray slash or path must never survive parse.
    expect(parsed.API_ORIGIN).toBe("http://localhost:8787");
    expect(parsed.WEB_ORIGIN).toBe("http://localhost:3000");
    expect(parsed.DASHBOARD_ORIGIN).toBe("http://localhost:3001");
  });
});

describe("email + login provider env (ADR-66/67)", () => {
  const PROD = {
    ...BASE,
    NODE_ENV: "production",
    DATABASE_URL: "postgres://user:pass@host/db?sslmode=require",
    API_ORIGIN: "https://api.example.com",
    WEB_ORIGIN: "https://example.com",
    DASHBOARD_ORIGIN: "https://app.example.com",
  };

  it("defaults EMAIL_DRIVER to console outside production", () => {
    expect(parseApiEnv({ ...BASE }).EMAIL_DRIVER).toBe("console");
  });

  it("requires RESEND_API_KEY and EMAIL_FROM together when EMAIL_DRIVER=resend", () => {
    expect(() => parseApiEnv({ ...BASE, EMAIL_DRIVER: "resend" })).toThrow(/RESEND_API_KEY/);
    expect(() =>
      parseApiEnv({ ...BASE, EMAIL_DRIVER: "resend", RESEND_API_KEY: "re_x" }),
    ).toThrow(/RESEND_API_KEY/);
    expect(() =>
      parseApiEnv({ ...BASE, EMAIL_DRIVER: "resend", EMAIL_FROM: "Mullion <auth@mullion.dev>" }),
    ).toThrow(/RESEND_API_KEY/);
    expect(
      parseApiEnv({
        ...BASE,
        EMAIL_DRIVER: "resend",
        RESEND_API_KEY: "re_x",
        EMAIL_FROM: "Mullion <auth@mullion.dev>",
      }).EMAIL_DRIVER,
    ).toBe("resend");
  });

  it("rejects the console driver in production — OTPs must not land in logs", () => {
    expect(() => parseApiEnv({ ...PROD })).toThrow(/EMAIL_DRIVER/);
    expect(
      parseApiEnv({
        ...PROD,
        EMAIL_DRIVER: "resend",
        RESEND_API_KEY: "re_x",
        EMAIL_FROM: "Mullion <auth@mullion.dev>",
      }).EMAIL_DRIVER,
    ).toBe("resend");
  });

  it("requires OAuth id/secret pairs to be complete (google, github-login)", () => {
    expect(() => parseApiEnv({ ...BASE, GOOGLE_CLIENT_ID: "id" })).toThrow(/GOOGLE_CLIENT_SECRET/);
    expect(() => parseApiEnv({ ...BASE, GITHUB_LOGIN_CLIENT_SECRET: "secret" })).toThrow(
      /GITHUB_LOGIN_CLIENT_SECRET/,
    );
    const both = parseApiEnv({
      ...BASE,
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "secret",
      GITHUB_LOGIN_CLIENT_ID: "id2",
      GITHUB_LOGIN_CLIENT_SECRET: "secret2",
    });
    expect(both.GOOGLE_CLIENT_ID).toBe("id");
    expect(both.GITHUB_LOGIN_CLIENT_ID).toBe("id2");
  });
});
