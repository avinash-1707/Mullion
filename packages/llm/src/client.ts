import { and, eq } from "drizzle-orm";
import { withSpan, type Span } from "@mullion/otel";
import { schema, type Db } from "@mullion/db";
import type { AgentRole } from "@mullion/schemas";
import { NoZdrProviderAvailableError, OpenRouterError, UnknownRoleError } from "./errors.js";
import { isModelAllowed } from "./model-allowlist.js";
import {
  openRouterErrorBodySchema,
  parseChatCompletion,
  parseStreamChunk,
  parseToolChatCompletion,
} from "./response.js";
import type { ToolCall, ToolChatMessage, ToolChoice, ToolDefinition } from "./tools.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const ROUTING_CACHE_TTL_MS = 60_000;
// Reasoning-tier completions run long, but never unbounded — a hung
// connection must fail retryably, not wedge the caller (02 §2.4).
const REQUEST_TIMEOUT_MS = 120_000;
const STREAM_TIMEOUT_MS = 300_000;
const STREAM_IDLE_TIMEOUT_MS = 45_000;
// ~4x a 16k-token completion — anything past this is a runaway provider.
const MAX_STREAM_CHARS = 2_000_000;

// Every LLM span carries who called (role) and what actually answered —
// served model + generation id + spend (02 §9's cost meter, per-span).
function setLlmResultAttributes(
  span: Span,
  result: {
    model: string;
    generationId: string;
    cost: number;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  },
): void {
  span.setAttributes({
    "mullion.llm.served_model": result.model,
    "mullion.llm.generation_id": result.generationId,
    "mullion.llm.cost_usd": result.cost,
    "mullion.llm.prompt_tokens": result.usage.promptTokens,
    "mullion.llm.completion_tokens": result.usage.completionTokens,
  });
}

/**
 * Size-bounded body read for the non-streaming paths — the same
 * memory-exhaustion guard the stream path has had since Phase 1 (finding
 * #6); a hostile/buggy provider or tampered cassette must not be able to
 * OOM the process with a fast multi-GB body (Phase 3 audit).
 */
async function readBodyCapped(response: Response, context: string): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new OpenRouterError({
      message: `${context} response had no body`,
      status: 502,
      retryable: true,
    });
  }
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > MAX_STREAM_CHARS) {
        throw new OpenRouterError({
          message: `${context} response exceeded ${MAX_STREAM_CHARS} chars — aborted`,
          status: 502,
          retryable: true,
        });
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  text += decoder.decode();
  return JSON.parse(text) as unknown;
}

function toAbortError(error: unknown, message: string): unknown {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new OpenRouterError({ message, status: 408, retryable: true });
  }
  return error;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CostContext {
  organizationId: string;
  userId?: string | undefined;
  sessionId?: string | undefined;
  runId?: string | undefined;
}

export interface CompleteChatArgs {
  role: AgentRole;
  messages: ChatMessage[];
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  // Who pays — every call is attributed to an org (ADR-28/36).
  costContext: CostContext;
}

export interface CompleteChatWithToolsArgs {
  role: AgentRole;
  messages: ToolChatMessage[];
  tools: ToolDefinition[];
  toolChoice?: ToolChoice | undefined;
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  costContext: CostContext;
}

export interface CompleteChatWithToolsResult {
  /** Null is valid on a tool-call turn — the model spoke only in tool_calls. */
  content: string | null;
  toolCalls: ToolCall[];
  finishReason: string | null;
  model: string;
  generationId: string;
  cost: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface CompleteChatResult {
  content: string;
  model: string;
  generationId: string;
  cost: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

interface RoutingEntry {
  modelSlug: string;
  fetchedAt: number;
}

/** The key a call will be signed with, and whose money it burns (ADR-70). */
export interface ResolvedApiKey {
  apiKey: string;
  byok: boolean;
}

/**
 * ADR-70: injected by the composition root to resolve an org's BYOK key
 * per call. Returning null means "no BYOK key — use the platform key".
 * Lives outside packages/llm so this package never learns tenancy tables'
 * secret handling; it stays the only OpenRouter integration point (ADR-24).
 */
export type ApiKeyResolver = (context: CostContext) => Promise<ResolvedApiKey | null>;

export interface OpenRouterClientOptions {
  apiKey: string;
  db: Db;
  /** HTTP-Referer attribution header value. */
  referer?: string | undefined;
  /** Injectable for tests — never hit the paid API from a test (CODING_STANDARDS §6). */
  fetchImpl?: typeof fetch | undefined;
  /** Dev/test only: point at a local mock. Production uses the default. */
  baseUrl?: string | undefined;
  /** ADR-70: per-call BYOK key lookup. Absent = platform key for everything. */
  apiKeyResolver?: ApiKeyResolver | undefined;
  /**
   * ADR-70: fired once when a BYOK-signed call fails auth (401/403) just
   * before the platform-key retry — the composition root disables the
   * stored key here so later calls skip straight to platform.
   */
  onByokAuthFailure?: ((context: CostContext, error: OpenRouterError) => Promise<void>) | undefined;
}

/**
 * The single LLM integration point (ADR-24). Call sites name a role; the
 * model slug comes from the model_routing table (ADR-25). ADR-26/27 are
 * enforced here structurally: `provider.zdr` is hardcoded true and the
 * `models` fallback array is never sent, so a silent model swap is
 * impossible by construction — provider-level failover for the pinned
 * model is OpenRouter's default behavior.
 */
export class OpenRouterClient {
  private readonly apiKey: string;
  private readonly db: Db;
  private readonly referer: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly apiKeyResolver: ApiKeyResolver | undefined;
  private readonly onByokAuthFailure:
    | ((context: CostContext, error: OpenRouterError) => Promise<void>)
    | undefined;
  // Keyed `${orgId}:${role}` — a global role key would leak one org's
  // override into another's calls (ADR-71).
  private readonly routingCache = new Map<string, RoutingEntry>();

  constructor(options: OpenRouterClientOptions) {
    this.apiKey = options.apiKey;
    this.db = options.db;
    this.referer = options.referer;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? OPENROUTER_BASE_URL;
    this.apiKeyResolver = options.apiKeyResolver;
    this.onByokAuthFailure = options.onByokAuthFailure;
  }

  private async resolveKey(context: CostContext): Promise<ResolvedApiKey> {
    if (this.apiKeyResolver) {
      const resolved = await this.apiKeyResolver(context);
      if (resolved) return resolved;
    }
    return { apiKey: this.apiKey, byok: false };
  }

  /**
   * ADR-70: a BYOK key is a live dependency that can die mid-build. On an
   * auth failure (401/403) under a BYOK key, notify the composition root
   * (which disables the stored key) and retry ONCE on the platform key —
   * never hard-fail a build on someone's stale key. Any other failure, or
   * a failure already on the platform key, throws as before.
   */
  private async fetchWithByokFallback(
    context: CostContext,
    doFetch: (apiKey: string) => Promise<Response>,
  ): Promise<{ response: Response; key: ResolvedApiKey }> {
    let key = await this.resolveKey(context);
    let response = await doFetch(key.apiKey);
    if (key.byok && (response.status === 401 || response.status === 403)) {
      const error = await this.toError(response);
      await this.onByokAuthFailure?.(context, error)?.catch(() => undefined);
      key = { apiKey: this.apiKey, byok: false };
      response = await doFetch(key.apiKey);
    }
    return { response, key };
  }

  private requestInit(
    args: CompleteChatArgs,
    modelSlug: string,
    stream: boolean,
    signal: AbortSignal,
    apiKey: string,
  ): RequestInit {
    return {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(this.referer ? { "HTTP-Referer": this.referer } : {}),
        "X-OpenRouter-Title": "Mullion",
      },
      body: JSON.stringify({
        model: modelSlug,
        messages: args.messages,
        ...(args.maxTokens !== undefined ? { max_tokens: args.maxTokens } : {}),
        ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
        ...(stream ? { stream: true } : {}),
        provider: { zdr: true },
      }),
    };
  }

  async completeChat(args: CompleteChatArgs): Promise<CompleteChatResult> {
    return withSpan("llm.completeChat", { "mullion.agent_role": args.role }, async (span) => {
      const result = await this.completeChatImpl(args);
      setLlmResultAttributes(span, result);
      return result;
    });
  }

  private async completeChatImpl(args: CompleteChatArgs): Promise<CompleteChatResult> {
    const modelSlug = await this.resolveModel(args.role, args.costContext.organizationId);

    let response: Response;
    let key: ResolvedApiKey;
    try {
      ({ response, key } = await this.fetchWithByokFallback(args.costContext, (apiKey) =>
        this.fetchImpl(
          `${this.baseUrl}/chat/completions`,
          // A hung provider must never wedge the caller's agent slot — abort
          // and surface as retryable (security review Phase 1, finding #1).
          this.requestInit(args, modelSlug, false, AbortSignal.timeout(REQUEST_TIMEOUT_MS), apiKey),
        ),
      ));
    } catch (error) {
      throw toAbortError(error, "OpenRouter request timed out");
    }

    if (!response.ok) {
      throw await this.toError(response);
    }

    const parsed = parseChatCompletion(await readBodyCapped(response, "OpenRouter completion"));
    const choice = parsed.choices[0];
    if (!choice || choice.message.content === null) {
      // An empty completion is a failure, not a valid empty result
      // (CODING_STANDARDS §4).
      throw new OpenRouterError({
        message: `OpenRouter returned no content (finish_reason: ${choice?.finish_reason ?? "unknown"})`,
        status: 502,
        retryable: true,
      });
    }

    await this.recordCost(args, modelSlug, parsed.usage.cost, parsed.usage, key.byok);

    return {
      content: choice.message.content,
      model: parsed.model,
      generationId: parsed.id,
      cost: parsed.usage.cost,
      usage: {
        promptTokens: parsed.usage.prompt_tokens,
        completionTokens: parsed.usage.completion_tokens,
        totalTokens: parsed.usage.total_tokens,
      },
    };
  }

  /**
   * Tool-calling variant (ADR-45): identical routing/ZDR/cost/timeout
   * semantics to completeChat, but the request carries `tools` +
   * `tool_choice` and the response may answer in `tool_calls` with null
   * content — a valid turn here, not the empty-completion failure.
   * Non-streaming by design for M1: there is no UI to stream to, and it
   * sidesteps reassembling fragmented tool_calls deltas across SSE chunks.
   */
  async completeChatWithTools(args: CompleteChatWithToolsArgs): Promise<CompleteChatWithToolsResult> {
    return withSpan("llm.completeChatWithTools", { "mullion.agent_role": args.role }, async (span) => {
      const result = await this.completeChatWithToolsImpl(args);
      setLlmResultAttributes(span, result);
      span.setAttribute("mullion.llm.tool_calls", result.toolCalls.length);
      return result;
    });
  }

  private async completeChatWithToolsImpl(
    args: CompleteChatWithToolsArgs,
  ): Promise<CompleteChatWithToolsResult> {
    const modelSlug = await this.resolveModel(args.role, args.costContext.organizationId);

    let response: Response;
    let key: ResolvedApiKey;
    try {
      ({ response, key } = await this.fetchWithByokFallback(args.costContext, (apiKey) =>
        this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(this.referer ? { "HTTP-Referer": this.referer } : {}),
            "X-OpenRouter-Title": "Mullion",
          },
          body: JSON.stringify({
            model: modelSlug,
            messages: args.messages,
            tools: args.tools,
            tool_choice: args.toolChoice ?? "auto",
            ...(args.maxTokens !== undefined ? { max_tokens: args.maxTokens } : {}),
            ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
            // ADR-26/27: ZDR hardcoded, no `models` fallback array — same
            // structural guarantees as completeChat.
            provider: { zdr: true },
          }),
        }),
      ));
    } catch (error) {
      throw toAbortError(error, "OpenRouter tool request timed out");
    }

    if (!response.ok) {
      throw await this.toError(response);
    }

    const parsed = parseToolChatCompletion(
      await readBodyCapped(response, "OpenRouter tool completion"),
    );
    const choice = parsed.choices[0];
    if (!choice) {
      throw new OpenRouterError({
        message: "OpenRouter tool completion returned no choices",
        status: 502,
        retryable: true,
      });
    }
    const toolCalls = choice.message.tool_calls ?? [];
    const content = choice.message.content ?? null;
    if (content === null && toolCalls.length === 0) {
      // Neither text nor tool calls — a genuinely empty turn is a failure.
      throw new OpenRouterError({
        message: `OpenRouter tool completion had no content and no tool_calls (finish_reason: ${choice.finish_reason ?? "unknown"})`,
        status: 502,
        retryable: true,
      });
    }

    await this.recordCost(args, modelSlug, parsed.usage.cost, parsed.usage, key.byok);

    return {
      content,
      toolCalls,
      finishReason: choice.finish_reason ?? null,
      model: parsed.model,
      generationId: parsed.id,
      cost: parsed.usage.cost,
      usage: {
        promptTokens: parsed.usage.prompt_tokens,
        completionTokens: parsed.usage.completion_tokens,
        totalTokens: parsed.usage.total_tokens,
      },
    };
  }

  /**
   * Streaming variant: identical routing/ZDR/cost semantics, but delivers
   * incremental content via `onDelta` — the Planner emits graph decisions
   * live as they generate (02 §2.3) instead of after a full completion.
   *
   * Wire format per OpenRouter docs: SSE `data:` lines of chunk JSON,
   * `: OPENROUTER PROCESSING` comment keep-alives (skipped), a final
   * `data: [DONE]` sentinel. Usage (incl. cost) arrives on the terminal
   * chunk automatically; mid-stream failures come as a 200-status chunk
   * with a top-level `error` key, which we surface as a typed error.
   */
  async completeChatStream(
    args: CompleteChatArgs & { onDelta: (text: string) => void | Promise<void> },
  ): Promise<CompleteChatResult> {
    return withSpan("llm.completeChatStream", { "mullion.agent_role": args.role }, async (span) => {
      const result = await this.completeChatStreamImpl(args);
      setLlmResultAttributes(span, result);
      return result;
    });
  }

  private async completeChatStreamImpl(
    args: CompleteChatArgs & { onDelta: (text: string) => void | Promise<void> },
  ): Promise<CompleteChatResult> {
    const modelSlug = await this.resolveModel(args.role, args.costContext.organizationId);

    // Two-layer abort: a hard deadline on the whole stream, plus an idle
    // watchdog so a provider that accepts then stalls can't hold the
    // caller's agent slot open (security review Phase 1, finding #1).
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
    let idle = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);
    const resetIdle = (): void => {
      clearTimeout(idle);
      idle = setTimeout(() => controller.abort(), STREAM_IDLE_TIMEOUT_MS);
    };

    let response: Response;
    let key: ResolvedApiKey;
    try {
      // The BYOK fallback fires on the pre-body auth check — a mid-stream
      // auth failure can't happen (the provider rejects before streaming).
      ({ response, key } = await this.fetchWithByokFallback(args.costContext, (apiKey) =>
        this.fetchImpl(
          `${this.baseUrl}/chat/completions`,
          this.requestInit(args, modelSlug, true, controller.signal, apiKey),
        ),
      ));
    } catch (error) {
      clearTimeout(deadline);
      clearTimeout(idle);
      throw toAbortError(error, "OpenRouter stream timed out before responding");
    }

    if (!response.ok) {
      clearTimeout(deadline);
      clearTimeout(idle);
      throw await this.toError(response);
    }
    if (!response.body) {
      clearTimeout(deadline);
      clearTimeout(idle);
      throw new OpenRouterError({
        message: "OpenRouter stream response had no body",
        status: 502,
        retryable: true,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let generationId = "";
    let model = modelSlug;
    let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; cost: number } | undefined;

    const handleLine = async (line: string): Promise<void> => {
      const trimmed = line.trim();
      // SSE comments (keep-alives) start with ':' — never JSON.
      if (trimmed.length === 0 || trimmed.startsWith(":")) return;
      if (!trimmed.startsWith("data:")) return;
      const data = trimmed.slice("data:".length).trim();
      if (data === "[DONE]") return;
      const chunk = parseStreamChunk(JSON.parse(data));
      if (chunk.error) {
        throw new OpenRouterError({
          message: `OpenRouter stream errored mid-flight: ${chunk.error.message}`,
          status: 502,
          retryable: true,
        });
      }
      if (chunk.id) generationId = chunk.id;
      if (chunk.model) model = chunk.model;
      if (chunk.usage) usage = chunk.usage;
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        content += delta;
        await args.onDelta(delta);
      }
    };

    try {
      for (;;) {
        let done: boolean;
        let value: Uint8Array | undefined;
        try {
          ({ done, value } = await reader.read());
        } catch (error) {
          throw toAbortError(error, "OpenRouter stream timed out mid-flight");
        }
        if (done) break;
        resetIdle();
        buffer += decoder.decode(value, { stream: true });
        // Untrusted provider output: cap accumulation so a runaway stream
        // can't exhaust memory (security review Phase 1, finding #6).
        if (buffer.length + content.length > MAX_STREAM_CHARS) {
          throw new OpenRouterError({
            message: `OpenRouter stream exceeded ${MAX_STREAM_CHARS} chars — aborted`,
            status: 502,
            retryable: true,
          });
        }
        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          await handleLine(line);
          newlineIndex = buffer.indexOf("\n");
        }
      }
      if (buffer.length > 0) {
        await handleLine(buffer);
      }
    } catch (error) {
      // Best-effort ADR-28 capture on failure: if a usage chunk arrived
      // before the stream died, the spend is real — record it. Without one
      // the provider-side spend is unknowable here; say so loudly.
      if (usage) {
        await this.recordCost(args, modelSlug, usage.cost, usage, key.byok).catch(() => undefined);
      } else if (content.length > 0) {
        console.error(
          `OpenRouter stream for role "${args.role}" failed after partial output with no usage chunk — provider-side spend untracked (ADR-28)`,
        );
      }
      throw error;
    } finally {
      clearTimeout(deadline);
      clearTimeout(idle);
      // Frees the connection on both success and mid-stream throw.
      await reader.cancel().catch(() => undefined);
    }

    if (content.length === 0) {
      throw new OpenRouterError({
        message: "OpenRouter stream ended with no content",
        status: 502,
        retryable: true,
      });
    }
    if (!usage) {
      // Cost capture is not optional (ADR-28) — a stream that never
      // delivered usage is treated as a failed call, not a free one.
      throw new OpenRouterError({
        message: "OpenRouter stream ended without a usage chunk — cost unknown",
        status: 502,
        retryable: true,
      });
    }

    await this.recordCost(args, modelSlug, usage.cost, usage, key.byok);

    return {
      content,
      model,
      generationId,
      cost: usage.cost,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
    };
  }

  private async resolveModel(role: AgentRole, organizationId: string): Promise<string> {
    const cacheKey = `${organizationId}:${role}`;
    const cached = this.routingCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < ROUTING_CACHE_TTL_MS) {
      return cached.modelSlug;
    }

    // ADR-71: an org override wins over the routing default, but only while
    // it is still allowlisted AND the org's BYOK key is enabled (platform
    // pays → platform picks). Both are read-time fail-safes: a stale row
    // falls back to the default instead of failing the build.
    const overrideRows = await this.db
      .select({ modelSlug: schema.modelOverrides.modelSlug })
      .from(schema.modelOverrides)
      .where(
        and(
          eq(schema.modelOverrides.organizationId, organizationId),
          eq(schema.modelOverrides.role, role),
        ),
      )
      .limit(1);
    const override = overrideRows[0];
    if (override && isModelAllowed(role, override.modelSlug)) {
      const keyRows = await this.db
        .select({ enabled: schema.byokKeys.enabled })
        .from(schema.byokKeys)
        .where(eq(schema.byokKeys.organizationId, organizationId))
        .limit(1);
      if (keyRows[0]?.enabled) {
        this.routingCache.set(cacheKey, { modelSlug: override.modelSlug, fetchedAt: Date.now() });
        return override.modelSlug;
      }
    }

    const rows = await this.db
      .select()
      .from(schema.modelRouting)
      .where(eq(schema.modelRouting.role, role))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new UnknownRoleError(role);
    }
    if (!row.zdrOnly) {
      // provider.zdr is hardcoded true regardless — this asserts nobody
      // weakened the routing table thinking it would take effect (ADR-27).
      throw new Error(
        `model_routing row for "${role}" has zdr_only=false — ADR-27 forbids non-ZDR routing; fix the row`,
      );
    }
    this.routingCache.set(cacheKey, { modelSlug: row.modelSlug, fetchedAt: Date.now() });
    return row.modelSlug;
  }

  /**
   * ADR-70: probe a candidate BYOK key against OpenRouter's free key-info
   * endpoint — no completion spend. `valid:false` means the key itself was
   * rejected; anything else (5xx, network) throws so the caller can tell
   * "bad key" apart from "OpenRouter is down".
   */
  async validateKey(apiKey: string): Promise<{ valid: boolean }> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/key`, {
        method: "GET",
        signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch (error) {
      throw toAbortError(error, "OpenRouter key validation timed out");
    }
    if (response.ok) {
      // Drain so the connection is reusable; the body content is irrelevant.
      await response.body?.cancel().catch(() => undefined);
      return { valid: true };
    }
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel().catch(() => undefined);
      return { valid: false };
    }
    throw await this.toError(response);
  }

  private async recordCost(
    args: { role: AgentRole; costContext: CostContext },
    modelSlug: string,
    cost: number,
    usage: unknown,
    byok: boolean,
  ): Promise<void> {
    const tokens = usage as { prompt_tokens?: unknown; completion_tokens?: unknown } | null;
    await this.db.insert(schema.costEvents).values({
      organizationId: args.costContext.organizationId,
      userId: args.costContext.userId ?? null,
      sessionId: args.costContext.sessionId ?? null,
      runId: args.costContext.runId ?? null,
      source: "llm",
      role: args.role,
      modelSlug,
      cost: cost.toFixed(8),
      usage,
      byok,
      promptTokens: typeof tokens?.prompt_tokens === "number" ? tokens.prompt_tokens : null,
      completionTokens:
        typeof tokens?.completion_tokens === "number" ? tokens.completion_tokens : null,
    });
  }

  private async toError(response: Response): Promise<OpenRouterError> {
    let message = `OpenRouter request failed with status ${response.status}`;
    let providerName: string | undefined;
    try {
      const body = openRouterErrorBodySchema.safeParse(await response.json());
      if (body.success) {
        message = `${message}: ${body.data.error.message}`;
        const meta = body.data.error.metadata;
        if (meta && typeof meta["provider_name"] === "string") {
          providerName = meta["provider_name"];
        }
      }
    } catch {
      // Body wasn't JSON — the status-derived message is all we have.
    }

    if (response.status === 503) {
      return new NoZdrProviderAvailableError(message);
    }
    const retryable = [408, 429, 500, 502].includes(response.status);
    return new OpenRouterError({ message, status: response.status, retryable, providerName });
  }
}

/** Seed ADR-25's routing table with the Phase 0 placeholder slugs. Idempotent. */
export async function seedModelRouting(db: Db): Promise<void> {
  const { DEFAULT_MODEL_ROUTING } = await import("./default-routing.js");
  await db
    .insert(schema.modelRouting)
    .values(
      Object.entries(DEFAULT_MODEL_ROUTING).map(([role, config]) => ({
        role: role as AgentRole,
        modelSlug: config.modelSlug,
        zdrOnly: config.zdrOnly,
      })),
    )
    .onConflictDoNothing();
}
