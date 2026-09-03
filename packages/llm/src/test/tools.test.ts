import { describe, expect, it, vi } from "vitest";
import type { Db } from "@mullion/db";
import { OpenRouterClient } from "../client.js";
import { MalformedLlmResponseError, OpenRouterError } from "../errors.js";

// Tool-calling is tested at the client boundary with a fake fetch — never a
// live call (CODING_STANDARDS §6).

function fakeDb(costInserts: unknown[]): Db {
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
    insert: () => ({
      values: (values: unknown) => {
        costInserts.push(values);
        return Promise.resolve();
      },
    }),
  } as unknown as Db;
}

const usage = { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12, cost: 0.002 };

const tools = [
  {
    type: "function" as const,
    function: {
      name: "writeFile",
      description: "Write a file",
      parameters: { type: "object", properties: { path: { type: "string" } } },
    },
  },
];

const baseArgs = {
  role: "coder" as const,
  messages: [{ role: "user" as const, content: "build it" }],
  tools,
  costContext: { organizationId: "org-1", runId: "run-1" },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("completeChatWithTools", () => {
  it("sends tools + tool_choice + zdr and no models[] fallback", async () => {
    const costInserts: unknown[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "gen-1",
        model: "test/model",
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "writeFile", arguments: '{"path":"a.ts"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage,
      }),
    );
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb(costInserts),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.completeChatWithTools(baseArgs);

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.tools).toHaveLength(1);
    expect(body.tool_choice).toBe("auto");
    expect(body.provider).toEqual({ zdr: true });
    expect(body.models).toBeUndefined();

    expect(result.content).toBeNull();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]?.function.name).toBe("writeFile");
    expect(result.finishReason).toBe("tool_calls");
    expect(result.cost).toBe(0.002);
    expect(costInserts).toHaveLength(1);
    expect(costInserts[0]).toMatchObject({ source: "llm", role: "coder", runId: "run-1" });
  });

  it("applies cache breakpoints + session_id when cache is requested (ADR-80)", async () => {
    const costInserts: unknown[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "gen-c",
        model: "test/model",
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: {
          ...usage,
          prompt_tokens_details: { cached_tokens: 4, cache_write_tokens: 1 },
        },
      }),
    );
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb(costInserts),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.completeChatWithTools({
      ...baseArgs,
      messages: [
        { role: "system" as const, content: "sys" },
        { role: "user" as const, content: "build it" },
      ],
      cache: { sessionId: "task-row-1" },
    });

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.session_id).toBe("task-row-1");
    expect(body.messages[0].content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.messages[1].content[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.tools[0].cache_control).toEqual({ type: "ephemeral" });
    // ZDR stays hardcoded regardless of caching (ADR-27).
    expect(body.provider).toEqual({ zdr: true });

    expect(result.usage.cachedTokens).toBe(4);
    expect(result.usage.cacheWriteTokens).toBe(1);
  });

  it("sends plain messages and no session_id when cache is not requested", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "gen-nc",
        model: "test/model",
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage,
      }),
    );
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb([]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.completeChatWithTools(baseArgs);

    const body = JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.session_id).toBeUndefined();
    expect(body.messages).toEqual(baseArgs.messages);
    expect(body.tools[0].cache_control).toBeUndefined();
    expect(result.usage.cachedTokens).toBeUndefined();
  });

  it("accepts a plain-text turn with no tool calls", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "gen-2",
        model: "test/model",
        choices: [{ message: { role: "assistant", content: "done" }, finish_reason: "stop" }],
        usage,
      }),
    );
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb([]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.completeChatWithTools(baseArgs);
    expect(result.content).toBe("done");
    expect(result.toolCalls).toEqual([]);
  });

  it("treats null content with zero tool calls as a retryable failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        id: "gen-3",
        model: "test/model",
        choices: [{ message: { role: "assistant", content: null }, finish_reason: "stop" }],
        usage,
      }),
    );
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb([]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.completeChatWithTools(baseArgs)).rejects.toThrowError(OpenRouterError);
  });

  it("rejects a malformed completion shape", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: "gen-4", model: "test/model", choices: [] }));
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb([]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.completeChatWithTools(baseArgs)).rejects.toThrowError(
      MalformedLlmResponseError,
    );
  });

  it("surfaces provider errors with retryable classification", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: 429, message: "rate limited" } }, 429));
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb([]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.completeChatWithTools(baseArgs)).rejects.toMatchObject({
      retryable: true,
      status: 429,
    });
  });

  it("aborts an oversized non-streaming body instead of buffering it whole (Phase 3 audit)", async () => {
    // A hostile/buggy provider streams a body past the 2M-char cap; the
    // capped reader must throw before OOM rather than await response.json().
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        const chunk = new TextEncoder().encode("x".repeat(500_000));
        for (let i = 0; i < 6; i += 1) controller.enqueue(chunk); // 3M chars
        controller.close();
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(oversized, { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb([]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.completeChatWithTools(baseArgs)).rejects.toMatchObject({ status: 502 });
  });
});
