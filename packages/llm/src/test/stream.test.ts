import { describe, expect, it, vi } from "vitest";
import type { Db } from "@mullion/db";
import { OpenRouterClient } from "../client.js";
import { OpenRouterError } from "../errors.js";

/**
 * Streaming is tested at the client boundary with a fake fetch — never a
 * live call (CODING_STANDARDS §6). The fake db satisfies exactly the two
 * query chains the client uses: model_routing lookup and cost insert.
 */

function fakeDb(costInserts: unknown[]): Db {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              { role: "planner", modelSlug: "test/model", zdrOnly: true, updatedAt: new Date() },
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

function sseResponse(lines: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      // Deliberately fragment mid-line to exercise buffering.
      const raw = lines.join("\n") + "\n";
      const mid = Math.floor(raw.length / 2);
      controller.enqueue(encoder.encode(raw.slice(0, mid)));
      controller.enqueue(encoder.encode(raw.slice(mid)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const usageChunk = {
  id: "gen-1",
  model: "test/model",
  choices: [{ delta: {}, finish_reason: "stop" }],
  usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12, cost: 0.001 },
};

describe("completeChatStream", () => {
  const baseArgs = {
    role: "planner" as const,
    promptVersion: "test-v1",
    messages: [{ role: "user" as const, content: "hi" }],
    costContext: { organizationId: "org-1" },
  };

  it("accumulates deltas, skips comments, captures usage, records cost", async () => {
    const costInserts: unknown[] = [];
    const deltas: string[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        ": OPENROUTER PROCESSING",
        `data: ${JSON.stringify({ choices: [{ delta: { content: "hel" } }] })}`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}`,
        `data: ${JSON.stringify(usageChunk)}`,
        "data: [DONE]",
      ]),
    );
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb(costInserts),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.completeChatStream({
      ...baseArgs,
      onDelta: (d) => {
        deltas.push(d);
      },
    });

    expect(deltas).toEqual(["hel", "lo"]);
    expect(result.content).toBe("hello");
    expect(result.cost).toBe(0.001);
    expect(costInserts).toHaveLength(1);

    const requestBody = JSON.parse(
      (fetchImpl.mock.calls[0]?.[1] as { body: string }).body,
    ) as Record<string, unknown>;
    expect(requestBody["stream"]).toBe(true);
    expect(requestBody["provider"]).toEqual({ zdr: true });
  });

  it("surfaces a mid-stream error chunk as a typed retryable error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "par" } }] })}`,
        `data: ${JSON.stringify({
          error: { code: "server_error", message: "Provider disconnected" },
          choices: [{ delta: { content: "" }, finish_reason: "error" }],
        })}`,
      ]),
    );
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb([]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      client.completeChatStream({ ...baseArgs, onDelta: () => undefined }),
    ).rejects.toThrow(OpenRouterError);
  });

  it("treats a stream that ends without usage as a failed call", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "hi" } }] })}`,
        "data: [DONE]",
      ]),
    );
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb([]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      client.completeChatStream({ ...baseArgs, onDelta: () => undefined }),
    ).rejects.toThrow(/usage/);
  });
});
