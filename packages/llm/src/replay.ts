import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { LlmReplayMissError } from "./errors.js";

/**
 * LLM record/replay cache (ADR-11, 02 §10.1). Sits at the fetch boundary of
 * OpenRouterClient — the one place every LLM call already passes through
 * (CODING_STANDARDS §6) — so routing, ZDR enforcement, parsing, cost capture,
 * and retry logic all execute identically under replay; only the network
 * round-trip is substituted.
 *
 * Cassettes are keyed by a hash of the full request body (model, messages,
 * tools, sampling params), and record which model/provider actually answered
 * alongside the pinned slug — the §10.1 distinction between "routing config
 * changed" and "a provider changed behavior under a pinned slug".
 */

export type LlmReplayMode = "record" | "replay";

export interface RecordReplayFetchOptions {
  mode: LlmReplayMode;
  /** Directory holding one JSON cassette per request key. */
  dir: string;
  /** Inner transport for record mode. Defaults to global fetch. */
  fetchImpl?: typeof fetch | undefined;
}

const cassetteSchema = z.object({
  key: z.string(),
  request: z.object({
    method: z.string(),
    path: z.string(),
    body: z.unknown(),
  }),
  response: z.object({
    status: z.number().int(),
    contentType: z.string().nullable(),
    bodyText: z.string(),
  }),
  meta: z.object({
    requestedModel: z.string().optional(),
    servedModel: z.string().optional(),
    provider: z.string().optional(),
    generationId: z.string().optional(),
    recordedAt: z.string(),
  }),
});

export type LlmCassette = z.infer<typeof cassetteSchema>;

// Lenient view of a completion body / stream chunk — only the metadata
// fields the cassette records; everything else passes through untouched.
const responseMetaSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
});

const requestBodySchema = z.object({ model: z.string().optional() });

export function cassetteKey(url: string, rawBody: string): string {
  const { pathname } = new URL(url);
  return createHash("sha256").update(`POST ${pathname}\n${rawBody}`).digest("hex");
}

function parseJsonSafe(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function requestedModelOf(rawBody: string): string | undefined {
  const parsed = requestBodySchema.safeParse(parseJsonSafe(rawBody));
  return parsed.success ? parsed.data.model : undefined;
}

/**
 * Best-effort served-model/provider extraction. JSON completions carry the
 * fields top-level; SSE streams carry them on each `data:` chunk — the last
 * chunk wins, matching how the client itself resolves them.
 */
function extractResponseMeta(bodyText: string, contentType: string | null): {
  servedModel?: string;
  provider?: string;
  generationId?: string;
} {
  const candidates: unknown[] = [];
  if (contentType?.includes("text/event-stream")) {
    for (const line of bodyText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice("data:".length).trim();
      if (data === "[DONE]") continue;
      candidates.push(parseJsonSafe(data));
    }
  } else {
    candidates.push(parseJsonSafe(bodyText));
  }

  const meta: { servedModel?: string; provider?: string; generationId?: string } = {};
  for (const candidate of candidates) {
    const parsed = responseMetaSchema.safeParse(candidate);
    if (!parsed.success) continue;
    if (parsed.data.model !== undefined) meta.servedModel = parsed.data.model;
    if (parsed.data.provider !== undefined) meta.provider = parsed.data.provider;
    if (parsed.data.id !== undefined) meta.generationId = parsed.data.id;
  }
  return meta;
}

function cassettePath(dir: string, key: string): string {
  return join(dir, `${key}.json`);
}

function replayResponse(cassette: LlmCassette): Response {
  return new Response(cassette.response.bodyText, {
    status: cassette.response.status,
    headers: cassette.response.contentType
      ? { "Content-Type": cassette.response.contentType }
      : {},
  });
}

async function readCassette(dir: string, key: string): Promise<LlmCassette | undefined> {
  let raw: string;
  try {
    raw = await readFile(cassettePath(dir, key), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  // A cassette is an on-disk trust boundary (hand-editable) — parse, don't cast.
  return cassetteSchema.parse(JSON.parse(raw) as unknown);
}

async function writeCassette(dir: string, cassette: LlmCassette): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(cassettePath(dir, cassette.key), `${JSON.stringify(cassette, null, 2)}\n`, "utf8");
}

/**
 * Returns a fetch-compatible function for OpenRouterClient's `fetchImpl`.
 *
 * record — forward to the real transport, persist successful responses.
 * replay — serve from disk only; a miss throws (never a silent live call).
 *
 * Never persists request headers: the Authorization bearer must not end up
 * in a cassette file (CODING_STANDARDS §7).
 */
export function createRecordReplayFetch(options: RecordReplayFetchOptions): typeof fetch {
  const inner = options.fetchImpl ?? fetch;

  const recordReplayFetch = async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    const rawBody = init?.body;
    if (typeof rawBody !== "string") {
      throw new Error(
        "record/replay fetch only supports string request bodies — it is wired for OpenRouterClient, not general HTTP",
      );
    }
    const key = cassetteKey(url, rawBody);

    if (options.mode === "replay") {
      const cassette = await readCassette(options.dir, key);
      if (!cassette) {
        throw new LlmReplayMissError({
          cassetteKey: key,
          cassettePath: cassettePath(options.dir, key),
          requestedModel: requestedModelOf(rawBody),
        });
      }
      return replayResponse(cassette);
    }

    const response = await inner(input, init);
    // Failures pass through unrecorded — a cassette holds a real completion,
    // not a transient 429/503 that replay would then replay forever.
    if (!response.ok) return response;

    // Draining the clone to completion before returning trades away live
    // stream deltas during record — deliberate: record is a fixture-capture
    // mode, and awaiting the write means a failed capture fails the call
    // loudly instead of silently producing no cassette (CODING_STANDARDS §4).
    const bodyText = await response.clone().text();
    const contentType = response.headers.get("content-type");
    const requestedModel = requestedModelOf(rawBody);
    const cassette: LlmCassette = {
      key,
      request: { method: "POST", path: new URL(url).pathname, body: parseJsonSafe(rawBody) },
      response: { status: response.status, contentType, bodyText },
      meta: {
        ...(requestedModel !== undefined ? { requestedModel } : {}),
        ...extractResponseMeta(bodyText, contentType),
        recordedAt: new Date().toISOString(),
      },
    };
    await writeCassette(options.dir, cassette);
    return response;
  };

  return recordReplayFetch as typeof fetch;
}
