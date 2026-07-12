import { describe, expect, it, vi } from "vitest";
import type { Db } from "@mullion/db";
import { OpenRouterClient } from "./client.js";
import { OpenRouterError } from "./errors.js";
import { MODEL_ALLOWLIST, assertAllowed, isModelAllowed } from "./model-allowlist.js";
import { ModelNotAllowedError } from "./errors.js";

/**
 * ADR-70/71 behavior at the client boundary, with a fake fetch and a fake
 * db (CODING_STANDARDS §6). resolveModel issues up to three select chains
 * per call (model_overrides → byok_keys → model_routing), so the fake db
 * serves select results from a FIFO queue.
 */

const ALLOWED = "anthropic/claude-haiku-4.5";
const DEFAULT = "anthropic/claude-sonnet-4.5";

function queueDb(selectResults: unknown[][], costInserts: unknown[] = []): Db {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(selectResults.shift() ?? []),
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

function completionResponse(status = 200): Response {
  return new Response(
    JSON.stringify({
      id: "gen-1",
      model: ALLOWED,
      choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18, cost: 0.002 },
    }),
    { status },
  );
}

const routingRow = { role: "planner", modelSlug: DEFAULT, zdrOnly: true, updatedAt: new Date() };
const baseArgs = {
  role: "planner" as const,
  messages: [{ role: "user" as const, content: "hi" }],
  costContext: { organizationId: "org-1" },
};

describe("model allowlist (ADR-71)", () => {
  it("covers every agent role", () => {
    for (const role of ["analyst", "planner", "coder", "tester", "reviewer", "devops"] as const) {
      expect(MODEL_ALLOWLIST[role].length).toBeGreaterThan(0);
    }
  });

  it("assertAllowed throws typed on a foreign slug", () => {
    expect(() => assertAllowed("planner", "evil/model")).toThrow(ModelNotAllowedError);
    expect(isModelAllowed("planner", ALLOWED)).toBe(true);
  });
});

describe("resolveModel with org overrides (ADR-71)", () => {
  it("uses the override when allowlisted and the BYOK key is enabled", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completionResponse());
    const client = new OpenRouterClient({
      apiKey: "platform-key",
      db: queueDb([
        [{ modelSlug: ALLOWED }], // model_overrides
        [{ enabled: true }], // byok_keys
      ]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.completeChat(baseArgs);
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe(ALLOWED);
    expect(body.provider).toEqual({ zdr: true });
  });

  it("falls back to the routing default when the stored override is not allowlisted", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completionResponse());
    const client = new OpenRouterClient({
      apiKey: "platform-key",
      db: queueDb([
        [{ modelSlug: "stale/model" }], // model_overrides — no longer allowed
        [routingRow], // model_routing
      ]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.completeChat(baseArgs);
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe(DEFAULT);
  });

  it("ignores the override when the BYOK key is disabled", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completionResponse());
    const client = new OpenRouterClient({
      apiKey: "platform-key",
      db: queueDb([
        [{ modelSlug: ALLOWED }], // model_overrides
        [{ enabled: false }], // byok_keys — disabled
        [routingRow], // model_routing
      ]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.completeChat(baseArgs);
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe(DEFAULT);
  });

  it("keeps routing isolated between orgs (cache re-key)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completionResponse());
    fetchImpl.mockResolvedValueOnce(completionResponse());
    const client = new OpenRouterClient({
      apiKey: "platform-key",
      db: queueDb([
        // org-1: override + enabled key
        [{ modelSlug: ALLOWED }],
        [{ enabled: true }],
        // org-2: no override, routing default
        [],
        [routingRow],
      ]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.completeChat(baseArgs);
    await client.completeChat({ ...baseArgs, costContext: { organizationId: "org-2" } });
    const bodyOrg1 = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    const bodyOrg2 = JSON.parse((fetchImpl.mock.calls[1]![1] as RequestInit).body as string);
    expect(bodyOrg1.model).toBe(ALLOWED);
    expect(bodyOrg2.model).toBe(DEFAULT);
  });
});

describe("BYOK key selection and fallback (ADR-70)", () => {
  it("signs with the resolved BYOK key and records byok=true with token counts", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completionResponse());
    const costInserts: unknown[] = [];
    const client = new OpenRouterClient({
      apiKey: "platform-key",
      db: queueDb([[], [routingRow]], costInserts),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKeyResolver: async () => ({ apiKey: "org-own-key", byok: true }),
    });
    await client.completeChat(baseArgs);
    const headers = (fetchImpl.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer org-own-key");
    expect(costInserts[0]).toMatchObject({ byok: true, promptTokens: 11, completionTokens: 7 });
  });

  it("uses the platform key when the resolver returns null", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(completionResponse());
    const costInserts: unknown[] = [];
    const client = new OpenRouterClient({
      apiKey: "platform-key",
      db: queueDb([[], [routingRow]], costInserts),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKeyResolver: async () => null,
    });
    await client.completeChat(baseArgs);
    const headers = (fetchImpl.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer platform-key");
    expect(costInserts[0]).toMatchObject({ byok: false });
  });

  it("retries once on the platform key when the BYOK key fails auth", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 }))
      .mockResolvedValueOnce(completionResponse());
    const costInserts: unknown[] = [];
    const onByokAuthFailure = vi.fn().mockResolvedValue(undefined);
    const client = new OpenRouterClient({
      apiKey: "platform-key",
      db: queueDb([[], [routingRow]], costInserts),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      apiKeyResolver: async () => ({ apiKey: "dead-key", byok: true }),
      onByokAuthFailure,
    });
    const result = await client.completeChat(baseArgs);
    expect(result.content).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryHeaders = (fetchImpl.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(retryHeaders["Authorization"]).toBe("Bearer platform-key");
    expect(onByokAuthFailure).toHaveBeenCalledTimes(1);
    // The retried call burned platform money — must not be marked byok.
    expect(costInserts[0]).toMatchObject({ byok: false });
  });

  it("does not retry an auth failure on the platform key itself", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: { message: "nope" } }), { status: 401 }));
    const client = new OpenRouterClient({
      apiKey: "platform-key",
      db: queueDb([[], [routingRow]]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.completeChat(baseArgs)).rejects.toThrow(OpenRouterError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("validateKey (ADR-70)", () => {
  it("returns valid on 200 and invalid on 401", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: {} }), { status: 401 }));
    const client = new OpenRouterClient({
      apiKey: "platform-key",
      db: queueDb([]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.validateKey("candidate")).resolves.toEqual({ valid: true });
    await expect(client.validateKey("candidate")).resolves.toEqual({ valid: false });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toMatch(/\/key$/);
    expect((init as RequestInit).method).toBe("GET");
  });

  it("throws on a 5xx so 'bad key' and 'OpenRouter down' stay distinct", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("oops", { status: 500 }));
    const client = new OpenRouterClient({
      apiKey: "platform-key",
      db: queueDb([]),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.validateKey("candidate")).rejects.toThrow(OpenRouterError);
  });
});
