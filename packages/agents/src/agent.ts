import type { ChatMessage, CompleteChatResult, CostContext, OpenRouterClient } from "@mullion/llm";
import type { AgentRole } from "@mullion/schemas";
import { withBackoff } from "./retry.js";

/**
 * The one contract every agent implements (CODING_STANDARDS §3): prompt
 * construction and response parsing are separate pure functions; the LLM
 * call and any side effects stay outside, in the runner and the service
 * layer respectively.
 */
export interface AgentSpec<TIn, TOut> {
  role: AgentRole;
  buildMessages(input: TIn): ChatMessage[];
  parse(content: string): TOut;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Executes a non-streaming agent: call with backoff, then parse. The parse
 * runs inside the retry loop — a malformed completion is retryable by
 * re-asking (isRetryableAgentError covers MalformedLlmResponseError).
 */
export async function runAgent<TIn, TOut>(
  client: OpenRouterClient,
  spec: AgentSpec<TIn, TOut>,
  input: TIn,
  costContext: CostContext,
): Promise<TOut> {
  return withBackoff(async () => {
    const result = await client.completeChat({
      role: spec.role,
      messages: spec.buildMessages(input),
      costContext,
      ...(spec.maxTokens !== undefined ? { maxTokens: spec.maxTokens } : {}),
      ...(spec.temperature !== undefined ? { temperature: spec.temperature } : {}),
    });
    return spec.parse(result.content);
  });
}

export type { ChatMessage, CompleteChatResult, CostContext };
