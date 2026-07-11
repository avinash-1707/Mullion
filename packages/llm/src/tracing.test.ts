import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { context, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import type { Db } from "@mullion/db";
import { OpenRouterClient } from "./client.js";

function fakeDb(): Db {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              { role: "coder", modelSlug: "test/model", zdrOnly: true, updatedAt: new Date() },
            ]),
        }),
      }),
    }),
    insert: () => ({ values: () => Promise.resolve() }),
  } as unknown as Db;
}

const completion = {
  id: "gen-9",
  model: "test/model-served",
  choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3, cost: 0.004 },
};

describe("LLM call spans (02 §9)", () => {
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

  it("emits a span per completion carrying role, served model, tokens, and cost", async () => {
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb(),
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(completion), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as unknown as typeof fetch,
    });

    await client.completeChat({
      role: "coder",
      messages: [{ role: "user", content: "x" }],
      costContext: { organizationId: "org-1" },
    });

    const span = exporter.getFinishedSpans().find((s) => s.name === "llm.completeChat");
    expect(span).toBeDefined();
    expect(span?.attributes["mullion.agent_role"]).toBe("coder");
    expect(span?.attributes["mullion.llm.served_model"]).toBe("test/model-served");
    expect(span?.attributes["mullion.llm.generation_id"]).toBe("gen-9");
    expect(span?.attributes["mullion.llm.cost_usd"]).toBe(0.004);
    expect(span?.attributes["mullion.llm.completion_tokens"]).toBe(2);
  });

  it("marks the span errored when the provider fails", async () => {
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb(),
      fetchImpl: vi
        .fn()
        .mockResolvedValue(new Response("{}", { status: 500 })) as unknown as typeof fetch,
    });

    await expect(
      client.completeChat({
        role: "coder",
        messages: [{ role: "user", content: "x" }],
        costContext: { organizationId: "org-1" },
      }),
    ).rejects.toThrow();

    const span = exporter.getFinishedSpans().find((s) => s.name === "llm.completeChat");
    expect(span?.status.code).toBe(2); // SpanStatusCode.ERROR
  });
});
