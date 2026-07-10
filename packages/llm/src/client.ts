import { eq } from "drizzle-orm";
import { schema, type Db } from "@mullion/db";
import type { AgentRole } from "@mullion/schemas";
import { NoZdrProviderAvailableError, OpenRouterError, UnknownRoleError } from "./errors.js";
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

export interface OpenRouterClientOptions {
  apiKey: string;
  db: Db;
  /** HTTP-Referer attribution header value. */
  referer?: string | undefined;
  /** Injectable for tests — never hit the paid API from a test (CODING_STANDARDS §6). */
  fetchImpl?: typeof fetch | undefined;
  /** Dev/test only: point at a local mock. Production uses the default. */
  baseUrl?: string | undefined;
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
  private readonly routingCache = new Map<AgentRole, RoutingEntry>();

  constructor(options: OpenRouterClientOptions) {
    this.apiKey = options.apiKey;
    this.db = options.db;
    this.referer = options.referer;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.baseUrl = options.baseUrl ?? OPENROUTER_BASE_URL;
  }

  private requestInit(
    args: CompleteChatArgs,
    modelSlug: string,
    stream: boolean,
    signal: AbortSignal,
  ): RequestInit {
    return {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
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
    const modelSlug = await this.resolveModel(args.role);

    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.baseUrl}/chat/completions`,
        // A hung provider must never wedge the caller's agent slot — abort
        // and surface as retryable (security review Phase 1, finding #1).
        this.requestInit(args, modelSlug, false, AbortSignal.timeout(REQUEST_TIMEOUT_MS)),
      );
    } catch (error) {
      throw toAbortError(error, "OpenRouter request timed out");
    }

    if (!response.ok) {
      throw await this.toError(response);
    }

    const parsed = parseChatCompletion(await response.json());
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

    await this.recordCost(args, modelSlug, parsed.usage.cost, parsed.usage);

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
    const modelSlug = await this.resolveModel(args.role);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
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
      });
    } catch (error) {
      throw toAbortError(error, "OpenRouter tool request timed out");
    }

    if (!response.ok) {
      throw await this.toError(response);
    }

    const parsed = parseToolChatCompletion(await response.json());
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

    await this.recordCost(args, modelSlug, parsed.usage.cost, parsed.usage);

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
    const modelSlug = await this.resolveModel(args.role);

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
    try {
      response = await this.fetchImpl(
        `${this.baseUrl}/chat/completions`,
        this.requestInit(args, modelSlug, true, controller.signal),
      );
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
        await this.recordCost(args, modelSlug, usage.cost, usage).catch(() => undefined);
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

    await this.recordCost(args, modelSlug, usage.cost, usage);

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

  private async resolveModel(role: AgentRole): Promise<string> {
    const cached = this.routingCache.get(role);
    if (cached && Date.now() - cached.fetchedAt < ROUTING_CACHE_TTL_MS) {
      return cached.modelSlug;
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
    this.routingCache.set(role, { modelSlug: row.modelSlug, fetchedAt: Date.now() });
    return row.modelSlug;
  }

  private async recordCost(
    args: { role: AgentRole; costContext: CostContext },
    modelSlug: string,
    cost: number,
    usage: unknown,
  ): Promise<void> {
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
