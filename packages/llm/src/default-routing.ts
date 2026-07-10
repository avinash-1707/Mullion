import type { AgentRole } from "@mullion/schemas";

/**
 * The ONLY place in the codebase a model slug is written down
 * (CODING_STANDARDS §3, ADR-24/25). These seed the `model_routing` table;
 * runtime calls read the table, so swapping a model is a row update, not a
 * redeploy.
 *
 * Slugs are Phase 0 PLACEHOLDERS (05 §Phase 0 allows this). Tiering per
 * 02 §5.1: analyst/planner/reviewer = reasoning tier, coder/tester/devops =
 * fast tier. Both tiers stay in the Claude family because it's the only
 * frontier family with two ZDR providers (Bedrock + Vertex) — the only one
 * where ADR-26's same-model provider failover actually works under ADR-27's
 * zdr-only routing.
 */
export const DEFAULT_MODEL_ROUTING: Record<AgentRole, { modelSlug: string; zdrOnly: true }> = {
  analyst: { modelSlug: "anthropic/claude-sonnet-4.5", zdrOnly: true },
  planner: { modelSlug: "anthropic/claude-sonnet-4.5", zdrOnly: true },
  reviewer: { modelSlug: "anthropic/claude-sonnet-4.5", zdrOnly: true },
  coder: { modelSlug: "anthropic/claude-haiku-4.5", zdrOnly: true },
  tester: { modelSlug: "anthropic/claude-haiku-4.5", zdrOnly: true },
  devops: { modelSlug: "anthropic/claude-haiku-4.5", zdrOnly: true },
};
