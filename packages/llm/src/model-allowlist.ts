import type { AgentRole } from "@mullion/schemas";
import { ModelNotAllowedError } from "./errors.js";

/**
 * ADR-71: the curated set of models an org may pick per role. Like
 * default-routing.ts, this is one of the only places a model slug is
 * written down (CODING_STANDARDS §3). Every entry is ZDR-verified by
 * inclusion — adding a slug here asserts it appears in OpenRouter's live
 * ZDR endpoint list (https://openrouter.ai/api/v1/endpoints/zdr) at the
 * time of the PR (ADR-27). Curation is a human PR, never a runtime write.
 *
 * Verified 2026-07-12 against that endpoint. Two curation rules:
 * - Roles are price-banded by task complexity: entries within a role sit
 *   at a similar $/1M level, so a pick is a lateral move, not a 20x cost
 *   surprise. Prices below are prompt/completion $ per 1M tokens.
 * - Single-ZDR-provider entries are allowed for BYOK picks, but ADR-26's
 *   same-model provider failover only exists for multi-provider entries —
 *   a 503 on a single-provider model surfaces to retry/escalation.
 *
 * Notably absent (no ZDR endpoint as of the check): the newest flagship
 * generation across every family (Claude Opus 4.8/Sonnet 5, GPT-5.6,
 * Gemini 3.x, Qwen 3.7, Kimi K2.6+, Mistral Medium 3.5+) and the entire
 * xAI Grok line. Re-check the ZDR list before adding any of them.
 */
export const MODEL_ALLOWLIST: Record<AgentRole, readonly string[]> = {
  // Requirement clarification / MCQ generation — strong reasoning,
  // mid-premium band (~$1.25–3 in / $4.4–15 out).
  analyst: [
    "anthropic/claude-sonnet-4.6", // $3/$15, 2 ZDR providers (Bedrock, Vertex)
    "anthropic/claude-sonnet-4.5", // $3/$15, 2 ZDR providers
    "google/gemini-2.5-pro", // $1.25/$10, 1 ZDR provider (Vertex)
    "z-ai/glm-5.1", // $1.40/$4.40, 3–4 ZDR providers
  ],
  // Architecture design — strongest reasoning band (~$1.4–5 in / $4.4–25 out).
  planner: [
    "anthropic/claude-opus-4.7", // $5/$25, 2 ZDR providers (Bedrock, Vertex)
    "anthropic/claude-opus-4.6", // $5/$25, 1 ZDR provider (Vertex)
    "anthropic/claude-sonnet-4.6", // $3/$15, 2 ZDR providers
    "z-ai/glm-5.2", // $1.40/$4.40, 1 ZDR provider (Z.AI direct)
  ],
  // Code review — strong reasoning band (~$1.25–5 in / $7–15 out).
  reviewer: [
    "anthropic/claude-sonnet-4.6", // $3/$15, 2 ZDR providers
    "anthropic/claude-sonnet-4.5", // $3/$15, 2 ZDR providers
    "deepseek/deepseek-r1-0528", // $3–5/$7, 2 ZDR providers (Together, SambaNova)
    "google/gemini-2.5-pro", // $1.25/$10, 1 ZDR provider (Vertex)
  ],
  // Code generation — capable code models, mid-cheap band
  // (~$0.27–1 in / $0.4–5 out).
  coder: [
    "anthropic/claude-haiku-4.5", // $1/$5, 2 ZDR providers (Bedrock, Vertex)
    "z-ai/glm-4.7", // $0.60/$2.20, 2 ZDR providers (Z.AI, Vertex)
    "deepseek/deepseek-chat-v3.1", // ~$0.28/$1.00, 2 ZDR providers
    "deepseek/deepseek-v3.2", // ~$0.27/$0.40, 2 ZDR providers
  ],
  // Test writing / verification — fast-cheap band (~$0.04–0.7 in / ≤$1 out).
  tester: [
    "meta-llama/llama-3.3-70b-instruct", // $0.13–0.72/$0.40–0.90, 4 ZDR providers
    "meta-llama/llama-4-scout", // $0.10–0.18/$0.30–0.59, 2 ZDR providers
    "openai/gpt-oss-120b", // $0.04–0.15/$0.17–0.95, 4 ZDR providers
    "mistralai/mistral-small-3.2-24b-instruct", // $0.09/$0.30, 1 ZDR provider
  ],
  // Packaging / CI config — cheapest band (~$0.04–0.10 in / ≤$0.4 out).
  devops: [
    "openai/gpt-oss-20b", // $0.04–0.07/$0.15–0.20, 5+ ZDR providers
    "google/gemini-2.5-flash-lite", // $0.10/$0.40, 1 ZDR provider (Vertex)
    "openai/gpt-4.1-nano", // $0.10/$0.40, 1 ZDR provider (Azure)
    "mistralai/mistral-small-3.2-24b-instruct", // $0.09/$0.30, 1 ZDR provider
  ],
};

export function isModelAllowed(role: AgentRole, modelSlug: string): boolean {
  return MODEL_ALLOWLIST[role].includes(modelSlug);
}

/** Write-time guard for override rows (ADR-71) — throws typed, never saves. */
export function assertAllowed(role: AgentRole, modelSlug: string): void {
  if (!isModelAllowed(role, modelSlug)) {
    throw new ModelNotAllowedError(role, modelSlug);
  }
}
