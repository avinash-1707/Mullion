# @mullion/llm

> The single LLM integration point (ADR-24): OpenRouter behind a role-based client.

Resolves model slugs from the `model_routing` DB table, enforces ZDR-only routing by construction, records cost per call, and traces everything.

## High-level idea

No package in this repo talks to a model provider directly. Everything goes through `OpenRouterClient`, keyed by agent role (`analyst`, `coder`, and so on) instead of a model name. What that buys:

- **Model swaps are DB row updates, not redeploys.** `DEFAULT_MODEL_ROUTING` (`src/default-routing.ts`) is the only file where model slugs are written down. `seedModelRouting` loads it. There is a reasoning tier (analyst, planner, reviewer) and a fast tier (coder, tester, devops).
- **ZDR is enforced in code, not by convention** (ADR-26/27). `provider.zdr: true` is hardcoded on every request, and a routing row with `zdr_only=false` throws. Fallback means the same model on a different provider, never a silent model swap.
- **Every call writes a `cost_events` row** (ADR-28) with the org and run context. This feeds the budget circuit breaker.
- Talks to OpenRouter over plain `fetch`. No provider SDK (ADR-25).

## Layout

| Module | What |
|---|---|
| `src/client.ts` | `OpenRouterClient`: `completeChat`, `completeChatWithTools` (ADR-45), `completeChatStream` (SSE, used by the Planner). Routing cache, timeouts with an idle watchdog, size-bounded body reads, cost recording. Also `seedModelRouting` |
| `src/default-routing.ts` | The only home of model slugs |
| `src/response.ts` | Zod parsers for completions, tool calls, and stream chunks |
| `src/tools.ts` | Tool-calling types (`ToolDefinition`, `ToolCall`, `ToolChoice`, and more) |
| `src/errors.ts` | Typed errors: `OpenRouterError`, `NoZdrProviderAvailableError`, `UnknownRoleError`, `MalformedLlmResponseError`, `LlmReplayMissError` |
| `src/replay.ts` | `createRecordReplayFetch`: record/replay cassettes keyed by a hash of the request body (ADR-11). Auth headers are never persisted |

## Exports

`.`: `OpenRouterClient`, `seedModelRouting`, chat and tool types, `CostContext`, the replay helpers, all error classes, and the response parsers.

## Configuration

No env reads. `apiKey`, `baseUrl`, `fetchImpl`, and `db` arrive via `OpenRouterClientOptions` from the API's wiring (`apps/api/src/llm.ts`).

## Where it fits

Consumed by `@mullion/agents` and by the orchestrator's review activity. Consumes `@mullion/db` (routing and cost tables), `@mullion/otel` (`withSpan`), and `@mullion/schemas` (`AgentRole`).

## Testing

Vitest: `replay`, `response`, `stream`, `tools`, and `tracing` suites. All of them inject `fetchImpl` or replay cassettes, so the paid API is never hit. `pnpm test`.
