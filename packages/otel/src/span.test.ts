import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { context, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { currentTraceId, withSpan } from "./span.js";

describe("withSpan", () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    trace.setGlobalTracerProvider(provider);
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  });

  afterEach(async () => {
    await provider.shutdown();
    trace.disable();
    context.disable();
  });

  it("records attributes, nests children, and exposes the trace id", async () => {
    let innerTraceId: string | undefined;
    const result = await withSpan("outer", { "mullion.k": "v" }, async () => {
      innerTraceId = currentTraceId();
      return withSpan("inner", {}, async () => 42);
    });
    expect(result).toBe(42);

    const spans = exporter.getFinishedSpans();
    expect(spans.map((s) => s.name).sort()).toEqual(["inner", "outer"]);
    const outer = spans.find((s) => s.name === "outer");
    const inner = spans.find((s) => s.name === "inner");
    expect(outer?.attributes["mullion.k"]).toBe("v");
    // Same trace, parent/child linked — the §9 "one trace_id end to end".
    expect(inner?.spanContext().traceId).toBe(outer?.spanContext().traceId);
    expect(innerTraceId).toBe(outer?.spanContext().traceId);
  });

  it("records the exception, marks error status, and rethrows", async () => {
    await expect(
      withSpan("boom", {}, async () => {
        throw new Error("kaput");
      }),
    ).rejects.toThrow("kaput");

    const span = exporter.getFinishedSpans()[0];
    expect(span?.status.code).toBe(2); // SpanStatusCode.ERROR
    expect(span?.events.some((e) => e.name === "exception")).toBe(true);
  });

  it("is a safe no-op without a registered provider", async () => {
    await provider.shutdown();
    trace.disable();
    expect(currentTraceId()).toBeUndefined();
    await expect(withSpan("noop", {}, async () => "ok")).resolves.toBe("ok");
  });
});
