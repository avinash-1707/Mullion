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
