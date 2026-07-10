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
