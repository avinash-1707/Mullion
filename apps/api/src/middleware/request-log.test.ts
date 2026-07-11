import { Hono } from "hono";
import { initLogger } from "@mullion/logger";
import { context, startOtel, trace } from "@mullion/otel";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestLogMiddleware } from "./request-log.js";
import { tracingMiddleware } from "./tracing.js";

/**
 * The ADR-63 correlation contract, end to end at the middleware layer: with
 * no OTLP endpoint set (the local-dev shape), startOtel's bare exporterless
 * provider + tracingMiddleware's request span must still put a real
 * trace_id/span_id on the request-completion log line.
 */
const rawLines: string[] = [];

beforeAll(async () => {
  delete process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  delete process.env["OTEL_SDK_DISABLED"];
  initLogger({
    service: "test-api",
    level: "info",
    stream: { write: (line: string) => void rawLines.push(line) },
  });
  await startOtel({ serviceName: "test-api" });
});

afterAll(() => {
  context.disable();
  trace.disable();
});

describe("requestLogMiddleware", () => {
  it("emits a structured completion line with trace_id from the request span", async () => {
    const app = new Hono();
    app.use("*", tracingMiddleware);
    app.use("*", requestLogMiddleware());
    app.get("/health", (c) => c.json({ ok: true }));

    const res = await app.request("/health");
    expect(res.status).toBe(200);

    const line = rawLines.map((raw) => JSON.parse(raw) as Record<string, unknown>).at(-1);
    expect(line).toMatchObject({
      module: "http",
      method: "GET",
      route: "/health",
      status: 200,
      msg: "request",
    });
    expect(line?.["trace_id"]).toMatch(/^[0-9a-f]{32}$/);
    expect(line?.["span_id"]).toMatch(/^[0-9a-f]{16}$/);
    expect(typeof line?.["duration_ms"]).toBe("number");
  });
});
