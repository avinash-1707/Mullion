import { eq } from "drizzle-orm";
import { schema, type Db } from "@mullion/db";
import type { AgentRole } from "@mullion/schemas";
import { NoZdrProviderAvailableError, OpenRouterError, UnknownRoleError } from "./errors.js";
import { openRouterErrorBodySchema, parseChatCompletion } from "./response.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const ROUTING_CACHE_TTL_MS = 60_000;

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
  private readonly routingCache = new Map<AgentRole, RoutingEntry>();

  constructor(options: OpenRouterClientOptions) {
    this.apiKey = options.apiKey;
    this.db = options.db;
    this.referer = options.referer;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async completeChat(args: CompleteChatArgs): Promise<CompleteChatResult> {
    const modelSlug = await this.resolveModel(args.role);

    const response = await this.fetchImpl(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
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
        provider: { zdr: true },
      }),
    });

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
    args: CompleteChatArgs,
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
