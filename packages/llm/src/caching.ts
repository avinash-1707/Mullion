import type { ToolChatMessage, ToolDefinition } from "./tools.js";

/**
 * Anthropic prompt caching over OpenRouter (ADR-80). EXPLICIT per-block
 * `cache_control` breakpoints only — the top-level automatic form is not
 * supported by Bedrock, and under ADR-27's `zdr: true` Bedrock and Vertex
 * are the only reachable Anthropic providers (Anthropic-direct is not ZDR
 * classified), so sending the automatic form would silently halve the
 * ADR-26 provider-failover pool.
 *
 * Breakpoint layout (3 of the 4 allowed):
 *   1. last block of the system prompt   — static across the whole loop
 *   2. last entry of the tools array     — static across the whole loop
 *   3. last content block of the newest message — advances every turn, so
 *      each call reads the longest previously written prefix
 *
 * `cache_control` must live INSIDE a content block, never as a sibling of
 * role/content on the message envelope (known silently-dropped shape).
 * Tool definitions are the documented exception: there the field sits on
 * the array entry itself.
 */

const EPHEMERAL = { type: "ephemeral" } as const;

interface TextBlock {
  type: "text";
  text: string;
  cache_control?: typeof EPHEMERAL;
}

export interface CacheOptions {
  /**
   * Stable per-conversation key for OpenRouter sticky routing — pins all
   * turns of one loop to the same provider endpoint so the cache written
   * on turn N is actually readable on turn N+1. Without it a mid-loop
   * provider flip (ADR-26 failover) cold-starts the cache silently.
   */
  sessionId: string;
}

function toCachedBlocks(content: string): TextBlock[] {
  return [{ type: "text", text: content, cache_control: EPHEMERAL }];
}

/**
 * Pure: returns cache-annotated copies for the wire; never mutates input.
 * Messages whose content shape we can't annotate (assistant turns, which
 * may carry null content + tool_calls) are passed through untouched — a
 * skipped breakpoint degrades cost, never correctness.
 */
export function applyCacheBreakpoints(
  messages: ToolChatMessage[],
  tools: ToolDefinition[],
): { messages: unknown[]; tools: unknown[] } {
  const lastIndex = messages.length - 1;
  const outMessages: unknown[] = messages.map((message, index) => {
    const isSystem = message.role === "system";
    const isLast = index === lastIndex;
    if (!isSystem && !isLast) return message;
    // Only user/system/tool messages carry a plain-string content we can
    // convert to blocks; assistant content may be null (tool_calls turn).
    if (message.role === "assistant") return message;
    return { ...message, content: toCachedBlocks(message.content) };
  });

  const outTools: unknown[] =
    tools.length > 0
      ? tools.map((tool, index) =>
          index === tools.length - 1 ? { ...tool, cache_control: EPHEMERAL } : tool,
        )
      : tools;

  return { messages: outMessages, tools: outTools };
}
