import {
  MalformedLlmResponseError,
  type ChatMessage,
  type CompleteChatResult,
  type CostContext,
  type OpenRouterClient,
} from "@mullion/llm";
import type { AgentRole } from "@mullion/schemas";
import { withBackoff } from "./retry.js";
import { truncateMiddle } from "./truncate.js";

// Bound the failed output echoed back on a self-repair retry — the point is
// the validation message, not paying twice for a runaway completion.
const MAX_REPAIR_ECHO_CHARS = 8_000;

/**
 * The one contract every agent implements (CODING_STANDARDS §3): prompt
 * construction and response parsing are separate pure functions; the LLM
 * call and any side effects stay outside, in the runner and the service
 * layer respectively.
 */
export interface AgentSpec<TIn, TOut> {
  role: AgentRole;
  /** Immutable source label for correlating evaluated prompt revisions. */
  promptVersion: string;
  buildMessages(input: TIn): ChatMessage[];
  parse(content: string): TOut;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Executes a non-streaming agent: call with backoff, then parse. The parse
 * runs inside the retry loop — a malformed completion is retryable by
 * re-asking (isRetryableAgentError covers MalformedLlmResponseError).
 *
 * Retries after a schema failure are SELF-REPAIRING: the failed output and
 * the validation error are appended to the conversation, because a blind
 * re-sample at low temperature tends to repeat the exact same shape
 * mistake (observed live: 5 MCQ options against a max-4 cap, three times
 * in a row). Transport errors still retry with the original messages.
 */
export async function runAgent<TIn, TOut>(
  client: OpenRouterClient,
  spec: AgentSpec<TIn, TOut>,
  input: TIn,
  costContext: CostContext,
): Promise<TOut> {
  return withBackoff(async (lastError) => {
    const messages = spec.buildMessages(input);
    if (lastError instanceof MalformedLlmResponseError) {
      const prior = truncateMiddle(
        typeof lastError.raw === "string" ? lastError.raw : JSON.stringify(lastError.raw),
        MAX_REPAIR_ECHO_CHARS,
      );
      messages.push(
        { role: "assistant", content: prior },
        {
          role: "user",
          content: `Your previous response failed validation: ${lastError.message}. Reply again with ONLY the corrected JSON — same content, fixed to satisfy the constraint.`,
        },
      );
    }
    const result = await client.completeChat({
      role: spec.role,
      promptVersion: spec.promptVersion,
      messages,
      costContext,
      ...(spec.maxTokens !== undefined ? { maxTokens: spec.maxTokens } : {}),
      ...(spec.temperature !== undefined ? { temperature: spec.temperature } : {}),
    });
    return spec.parse(result.content);
  });
}

export type { ChatMessage, CompleteChatResult, CostContext };
