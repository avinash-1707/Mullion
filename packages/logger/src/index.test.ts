import { context, trace } from "@opentelemetry/api";
import { AsyncHooksContextManager } from "@opentelemetry/context-async-hooks";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { afterAll, describe, expect, it } from "vitest";
import { childLogger, initLogger } from "./index.js";

/** Capture every emitted line as a parsed JSON object. */
function captureLogger(): { lines: () => Record<string, unknown>[]; service: string } {
  const raw: string[] = [];
  initLogger({
    service: "test-service",
    level: "info",
    stream: { write: (line: string) => void raw.push(line) },
  });
  return {
    lines: () => raw.map((line) => JSON.parse(line) as Record<string, unknown>),
    service: "test-service",
  };
}

function firstLine(cap: ReturnType<typeof captureLogger>): Record<string, unknown> {
  const line = cap.lines()[0];
  if (!line) throw new Error("no log line captured");
  return line;
}

// Real context manager + exporterless provider so the mixin sees an active
// span — the same shape startOtel() registers in a dev process (ADR-63).
const contextManager = new AsyncHooksContextManager().enable();
context.setGlobalContextManager(contextManager);
const provider = new BasicTracerProvider();
trace.setGlobalTracerProvider(provider);

afterAll(() => {
  context.disable();
  trace.disable();
});

describe("initLogger", () => {
  it("emits parseable JSON with the service name", () => {
    const cap = captureLogger();
    childLogger({ module: "unit" }).info("hello");
    const [line] = cap.lines();
    expect(line).toMatchObject({ name: "test-service", module: "unit", msg: "hello" });
  });

  it("redacts secret-bearing paths at top level and one level deep", () => {
    const cap = captureLogger();
    childLogger({ module: "unit" }).info(
      {
        authorization: "Bearer xyz",
        token: "tok",
        request: { headers: { authorization: "Bearer nested" } },
        llm: { prompt: "user secret idea", completion: "generated" },
        messages: [{ role: "user", content: "hi" }],
        apiKey: "sk-123",
        access_token: "gho_abc",
        api_key: "sk-456",
        headers: { cookie: "session=abc", "set-cookie": "session=def" },
        password: "hunter2",
      },
      "redaction",
    );
    const line = firstLine(cap);
    expect(line["authorization"]).toBe("[redacted]");
    expect(line["token"]).toBe("[redacted]");
    expect((line["request"] as { headers: { authorization: string } }).headers.authorization).toBe(
      "[redacted]",
    );
    expect((line["llm"] as { prompt: string; completion: string }).prompt).toBe("[redacted]");
    expect((line["llm"] as { prompt: string; completion: string }).completion).toBe("[redacted]");
    expect(line["messages"]).toBe("[redacted]");
    expect(line["apiKey"]).toBe("[redacted]");
    expect(line["access_token"]).toBe("[redacted]");
    expect(line["api_key"]).toBe("[redacted]");
    const headers = line["headers"] as Record<string, string>;
    expect(headers["cookie"]).toBe("[redacted]");
    expect(headers["set-cookie"]).toBe("[redacted]");
    expect(line["password"]).toBe("[redacted]");
    expect(JSON.stringify(line)).not.toContain("Bearer");
    expect(JSON.stringify(line)).not.toContain("session=");
  });

  it("stamps trace_id/span_id from the active span, and omits them without one", () => {
    const cap = captureLogger();
    const log = childLogger({ module: "unit" });
    log.info("outside span");
    let expected: { traceId: string; spanId: string } | undefined;
    provider.getTracer("test").startActiveSpan("op", (span) => {
      expected = { traceId: span.spanContext().traceId, spanId: span.spanContext().spanId };
      log.info("inside span");
      span.end();
    });
    const [outside, inside] = cap.lines();
    expect(outside).not.toHaveProperty("trace_id");
    expect(inside).toMatchObject({ trace_id: expected?.traceId, span_id: expected?.spanId });
  });

  it("carries child bindings on every line", () => {
    const cap = captureLogger();
    const log = childLogger({ module: "orchestrator", run_id: "run-1", org_id: "org-1" });
    log.info("first");
    log.warn("second");
    for (const line of cap.lines()) {
      expect(line).toMatchObject({ module: "orchestrator", run_id: "run-1", org_id: "org-1" });
    }
  });

  it("serializes err to type/message/stack, not arbitrary properties", () => {
    const cap = captureLogger();
    const error = Object.assign(new Error("boom"), {
      request: { headers: { authorization: "Bearer leaky" } },
    });
    childLogger({ module: "unit" }).error({ err: error }, "failed");
    const line = firstLine(cap);
    const err = line["err"] as Record<string, unknown>;
    expect(err["message"]).toBe("boom");
    expect(err["type"]).toBe("Error");
    expect(JSON.stringify(line)).not.toContain("Bearer leaky");
  });

  it("serializes a non-Error err to its string form", () => {
    const cap = captureLogger();
    childLogger({ module: "unit" }).error({ err: "string failure" }, "failed");
    const err = firstLine(cap)["err"] as Record<string, unknown>;
    expect(err["message"]).toBe("string failure");
  });
});
