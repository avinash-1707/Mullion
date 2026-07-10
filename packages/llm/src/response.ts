import { z } from "zod";
import { MalformedLlmResponseError } from "./errors.js";

// Parse-don't-trust at the OpenRouter boundary (CODING_STANDARDS §1).
// Only the fields we consume — passthrough keeps the rest available on raw.

export const openRouterUsageSchema = z
  .object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
    // Credits charged for this request — OpenRouter returns this on every
    // response now (the old `usage: { include: true }` opt-in is a no-op).
    cost: z.number(),
  })
  .loose();

export const chatCompletionResponseSchema = z
  .object({
    id: z.string(),
    model: z.string(),
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                role: z.string(),
                content: z.string().nullable(),
              })
              .loose(),
            finish_reason: z.string().nullish(),
          })
          .loose(),
      )
      .min(1),
    usage: openRouterUsageSchema,
  })
  .loose();

export type ChatCompletionResponse = z.infer<typeof chatCompletionResponseSchema>;

export const openRouterErrorBodySchema = z
  .object({
    error: z
      .object({
        code: z.number(),
        message: z.string(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .loose(),
  })
  .loose();

/**
 * One SSE `data:` chunk of a streamed completion. Everything is optional by
 * design: interior chunks carry only deltas, the terminal chunk carries
 * `finish_reason` + `usage`, and a mid-stream failure arrives as a
 * 200-status chunk with a top-level `error` (headers were already sent).
 */
export const streamChunkSchema = z
  .object({
    id: z.string().optional(),
    model: z.string().optional(),
    error: z
      .object({
        code: z.union([z.number(), z.string()]).optional(),
        message: z.string(),
      })
      .loose()
      .optional(),
    choices: z
      .array(
        z
          .object({
            delta: z.object({ content: z.string().nullish() }).loose().optional(),
            finish_reason: z.string().nullish(),
          })
          .loose(),
      )
      .optional(),
    usage: openRouterUsageSchema.optional(),
  })
  .loose();

export type StreamChunk = z.infer<typeof streamChunkSchema>;

export function parseStreamChunk(raw: unknown): StreamChunk {
  const parsed = streamChunkSchema.safeParse(raw);
  if (!parsed.success) {
    throw new MalformedLlmResponseError(
      `OpenRouter stream chunk failed schema parse: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      raw,
    );
  }
  return parsed.data;
}

export function parseChatCompletion(raw: unknown): ChatCompletionResponse {
  const parsed = chatCompletionResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new MalformedLlmResponseError(
      `OpenRouter response failed schema parse: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
      raw,
    );
  }
  return parsed.data;
}
