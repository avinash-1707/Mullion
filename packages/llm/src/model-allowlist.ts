import type { AgentRole } from "@mullion/schemas";
import { ModelNotAllowedError } from "./errors.js";

/**
 * ADR-71: the curated set of models an org may pick per role. Like
 * default-routing.ts, this is one of the only places a model slug is
 * written down (CODING_STANDARDS §3). Every entry is ZDR-verified by
 * inclusion — adding a slug here asserts it has a ZDR provider (ADR-27),
 * and curation is a human PR, never a runtime write.
 *
 * Claude-family only for now: it is the only frontier family with two ZDR
 * providers, so ADR-26's same-model provider failover keeps working for
 * any pick (see default-routing.ts).
 */
export const MODEL_ALLOWLIST: Record<AgentRole, readonly string[]> = {
  analyst: ["anthropic/claude-sonnet-4.5", "anthropic/claude-haiku-4.5"],
  planner: ["anthropic/claude-sonnet-4.5", "anthropic/claude-haiku-4.5"],
  reviewer: ["anthropic/claude-sonnet-4.5", "anthropic/claude-haiku-4.5"],
  coder: ["anthropic/claude-sonnet-4.5", "anthropic/claude-haiku-4.5"],
  tester: ["anthropic/claude-sonnet-4.5", "anthropic/claude-haiku-4.5"],
  devops: ["anthropic/claude-sonnet-4.5", "anthropic/claude-haiku-4.5"],
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
