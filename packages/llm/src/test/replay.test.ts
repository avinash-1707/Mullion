import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@mullion/db";
import { OpenRouterClient } from "../client.js";
import { LlmReplayMissError } from "../errors.js";
import { cassetteKey, createRecordReplayFetch } from "../replay.js";

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

const completionBody = {
  id: "gen-42",
  model: "test/model-v2",
  provider: "SomeProvider",
  choices: [{ message: { role: "assistant", content: "recorded answer" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8, cost: 0.002 },
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const baseArgs = {
  role: "planner" as const,
  promptVersion: "test-v1",
  messages: [{ role: "user" as const, content: "hi" }],
  costContext: { organizationId: "org-1" },
};

describe("record/replay fetch (ADR-11)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "llm-cassettes-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("records a completion, then replays it identically without the network", async () => {
    const innerFetch = vi.fn().mockResolvedValue(jsonResponse(completionBody));
    const recordClient = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb([]),
      fetchImpl: createRecordReplayFetch({
        mode: "record",
        dir,
        fetchImpl: innerFetch as unknown as typeof fetch,
      }),
    });
    const recorded = await recordClient.completeChat(baseArgs);
    expect(recorded.content).toBe("recorded answer");
    expect(innerFetch).toHaveBeenCalledTimes(1);

    const replayCostInserts: unknown[] = [];
    const replayClient = new OpenRouterClient({
      apiKey: "different-key-irrelevant",
      db: fakeDb(replayCostInserts),
      fetchImpl: createRecordReplayFetch({ mode: "replay", dir }),
    });
    const replayed = await replayClient.completeChat(baseArgs);

    expect(replayed).toEqual(recorded);
    // Replay still exercises cost capture — the point of ADR-11 is testing
    // everything around the call, including ADR-28's meter.
    expect(replayCostInserts).toHaveLength(1);
  });

  it("stores served model/provider metadata alongside the pinned slug, and never the API key", async () => {
    const innerFetch = vi.fn().mockResolvedValue(jsonResponse(completionBody));
    const client = new OpenRouterClient({
      apiKey: "sk-secret-value",
      db: fakeDb([]),
      fetchImpl: createRecordReplayFetch({
        mode: "record",
        dir,
        fetchImpl: innerFetch as unknown as typeof fetch,
      }),
    });
    await client.completeChat(baseArgs);

    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const raw = await readFile(join(dir, files[0] ?? ""), "utf8");
    expect(raw).not.toContain("sk-secret-value");
    const cassette = JSON.parse(raw) as {
      meta: { requestedModel?: string; servedModel?: string; provider?: string; generationId?: string };
    };
    expect(cassette.meta.requestedModel).toBe("test/model");
    expect(cassette.meta.servedModel).toBe("test/model-v2");
    expect(cassette.meta.provider).toBe("SomeProvider");
    expect(cassette.meta.generationId).toBe("gen-42");
  });

  it("throws LlmReplayMissError on a replay miss instead of calling live", async () => {
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb([]),
      fetchImpl: createRecordReplayFetch({ mode: "replay", dir }),
    });
    await expect(client.completeChat(baseArgs)).rejects.toBeInstanceOf(LlmReplayMissError);
  });

  it("records and replays a streaming completion through completeChatStream", async () => {
    const sse = [
      ": OPENROUTER PROCESSING",
      `data: ${JSON.stringify({ id: "gen-s", model: "test/model-v2", provider: "SomeProvider", choices: [{ delta: { content: "hel" } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}`,
      `data: ${JSON.stringify({ id: "gen-s", model: "test/model-v2", choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4, cost: 0.001 } })}`,
      "data: [DONE]",
      "",
    ].join("\n");
    const innerFetch = vi.fn().mockResolvedValue(
      new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    );

    const recordClient = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb([]),
      fetchImpl: createRecordReplayFetch({
        mode: "record",
        dir,
        fetchImpl: innerFetch as unknown as typeof fetch,
      }),
    });
    const recorded = await recordClient.completeChatStream({ ...baseArgs, onDelta: () => undefined });
    expect(recorded.content).toBe("hello");

    const deltas: string[] = [];
    const replayClient = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb([]),
      fetchImpl: createRecordReplayFetch({ mode: "replay", dir }),
    });
    const replayed = await replayClient.completeChatStream({
      ...baseArgs,
      onDelta: (d) => {
        deltas.push(d);
      },
    });
    expect(replayed).toEqual(recorded);
    expect(deltas.join("")).toBe("hello");
  });

  it("does not record failure responses", async () => {
    const innerFetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 429, headers: { "Content-Type": "application/json" } }));
    const client = new OpenRouterClient({
      apiKey: "k",
      db: fakeDb([]),
      fetchImpl: createRecordReplayFetch({
        mode: "record",
        dir,
        fetchImpl: innerFetch as unknown as typeof fetch,
      }),
    });
    await expect(client.completeChat(baseArgs)).rejects.toThrow();
    expect(await readdir(dir)).toHaveLength(0);
  });

  it("keys cassettes by request content — different messages, different cassette", () => {
    const url = "http://localhost/api/v1/chat/completions";
    const a = cassetteKey(url, JSON.stringify({ model: "m", messages: [{ role: "user", content: "a" }] }));
    const b = cassetteKey(url, JSON.stringify({ model: "m", messages: [{ role: "user", content: "b" }] }));
    expect(a).not.toBe(b);
    expect(a).toBe(cassetteKey(url, JSON.stringify({ model: "m", messages: [{ role: "user", content: "a" }] })));
  });
});
