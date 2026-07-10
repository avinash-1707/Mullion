import { z } from "zod";

// The messages.envelope shape (ADR-46): the durable per-turn transcript of
// an agent loop. Validated on write and on read — a row that fails parse is
// corruption, not input.

export const envelopeToolCallSchema = z.object({
  id: z.string().max(256),
  name: z.string().max(128),
  // Raw JSON-string arguments as received off the wire. Must comfortably
  // exceed a max-size writeFile: content is capped at 256KB (coder-tools),
  // and JSON-escaping (\n, \", control chars) can roughly double it, so a
  // legitimate writeFile envelope stays valid rather than failing read
  // validation as "corruption".
  arguments: z.string().max(768 * 1024),
});
export type EnvelopeToolCall = z.infer<typeof envelopeToolCallSchema>;

export const agentMessageEnvelopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("system"), content: z.string().max(64 * 1024) }),
  z.object({ kind: z.literal("user"), content: z.string().max(64 * 1024) }),
  z.object({
    kind: z.literal("assistant"),
    content: z.string().max(64 * 1024).nullable(),
    // Cap sits above the loop's per-turn action cap (16) so a runaway turn is
    // faithfully recorded in the transcript before the loop rejects it.
    toolCalls: z.array(envelopeToolCallSchema).max(64).default([]),
    generationId: z.string().max(256),
    costUsd: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal("tool_result"),
    toolCallId: z.string().max(256),
    toolName: z.string().max(128),
    /** False = semantic failure fed back to the model (bad args, non-zero exit surfaced as text). */
    ok: z.boolean(),
    /** Already truncated to the loop's maxToolResultChars before persisting. */
    content: z.string().max(64 * 1024),
    exitCode: z.number().int().optional(),
    durationMs: z.number().nonnegative().optional(),
  }),
]);
export type AgentMessageEnvelope = z.infer<typeof agentMessageEnvelopeSchema>;
