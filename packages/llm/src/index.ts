export {
  OpenRouterClient,
  seedModelRouting,
  type ApiKeyResolver,
  type ChatMessage,
  type CompleteChatArgs,
  type CompleteChatResult,
  type CompleteChatWithToolsArgs,
  type CompleteChatWithToolsResult,
  type CostContext,
  type OpenRouterClientOptions,
  type ResolvedApiKey,
} from "./client.js";
export { MODEL_ALLOWLIST, assertAllowed, isModelAllowed } from "./model-allowlist.js";
export {
  cassetteKey,
  createRecordReplayFetch,
  type LlmCassette,
  type LlmReplayMode,
  type RecordReplayFetchOptions,
} from "./replay.js";
export type { ToolCall, ToolChatMessage, ToolChoice, ToolDefinition } from "./tools.js";
export { applyCacheBreakpoints, type CacheOptions } from "./caching.js";
export {
  LlmReplayMissError,
  MalformedLlmResponseError,
  ModelNotAllowedError,
  NoZdrProviderAvailableError,
  OpenRouterError,
  UnknownRoleError,
} from "./errors.js";
export {
  parseChatCompletion,
  parseStreamChunk,
  parseToolChatCompletion,
  type ChatCompletionResponse,
  type StreamChunk,
  type ToolChatCompletionResponse,
} from "./response.js";
