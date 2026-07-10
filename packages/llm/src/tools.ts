// Native OpenAI-compatible function-calling wire types (ADR-45). OpenRouter
// mirrors OpenAI's chat schema, so these are the real wire shapes — a later
// swap to live creds changes nothing (same principle as the SSE-shape-
// accurate mock, Phase 1).

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    /** JSON Schema for the arguments object. */
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    /** A JSON *string* on the wire — parse AND zod-validate, never trust. */
    arguments: string;
  };
}

/**
 * Chat message for tool-calling conversations. Distinct from the text-only
 * `ChatMessage`: assistant content may be null when tool_calls are present,
 * and tool results travel as role:"tool" tied to their call id.
 */
export type ToolChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolChoice = "auto" | "none" | "required";
