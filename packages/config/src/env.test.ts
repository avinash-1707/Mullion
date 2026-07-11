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
