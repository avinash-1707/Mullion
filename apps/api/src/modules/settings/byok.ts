import { eq } from "drizzle-orm";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { schema, type Db } from "@mullion/db";
import type { ApiKeyResolver, CostContext, OpenRouterError } from "@mullion/llm";
import { childLogger } from "@mullion/logger";
import { env } from "../../config/env.js";

/**
 * ADR-70 BYOK key storage. Same at-rest posture as the GitHub OAuth token
 * (Phase 3 audit M2): AES-256-GCM via better-auth's symmetric helpers,
 * keyed off BETTER_AUTH_SECRET. The plaintext key exists only in memory
 * between decrypt and the outbound Authorization header — never in logs
 * (ADR-63) and never in a response body.
 */

export function encryptByokKey(apiKey: string): Promise<string> {
  return symmetricEncrypt({ key: env.BETTER_AUTH_SECRET, data: apiKey });
}

export interface OrgByokKeyRow {
  hasKey: boolean;
  keyLast4: string | null;
  enabled: boolean;
}

/** Masked status for the settings UI — the plaintext key never leaves the API. */
export async function getOrgByokStatus(db: Db, organizationId: string): Promise<OrgByokKeyRow> {
  const [row] = await db
    .select({ keyLast4: schema.byokKeys.keyLast4, enabled: schema.byokKeys.enabled })
    .from(schema.byokKeys)
    .where(eq(schema.byokKeys.organizationId, organizationId))
    .limit(1);
  return row
    ? { hasKey: true, keyLast4: row.keyLast4, enabled: row.enabled }
    : { hasKey: false, keyLast4: null, enabled: false };
}

/**
 * ADR-70: injected into OpenRouterClient. An org with an enabled key pays
 * with it; anything else (no row, disabled, undecryptable) resolves to the
 * platform key. Decrypt failure is fail-safe by design — a rotated
 * BETTER_AUTH_SECRET must degrade to platform billing, not break builds.
 */
export function byokApiKeyResolver(db: Db): ApiKeyResolver {
  return async (context: CostContext) => {
    const [row] = await db
      .select({ encryptedKey: schema.byokKeys.encryptedKey, enabled: schema.byokKeys.enabled })
      .from(schema.byokKeys)
      .where(eq(schema.byokKeys.organizationId, context.organizationId))
      .limit(1);
    if (!row?.enabled) return null;
    try {
      const apiKey = await symmetricDecrypt({ key: env.BETTER_AUTH_SECRET, data: row.encryptedKey });
      return { apiKey, byok: true };
    } catch {
      childLogger({ module: "byok" }).error(
        { organizationId: context.organizationId },
        "BYOK key failed to decrypt — falling back to platform key (was BETTER_AUTH_SECRET rotated?)",
      );
      return null;
    }
  };
}

/**
 * ADR-70: fired by the client just before its platform-key retry. Disabling
 * the row makes every later call skip straight to the platform key instead
 * of re-probing a dead key once per LLM call.
 */
export function disableByokKeyOnAuthFailure(db: Db) {
  return async (context: CostContext, error: OpenRouterError): Promise<void> => {
    await db
      .update(schema.byokKeys)
      .set({ enabled: false })
      .where(eq(schema.byokKeys.organizationId, context.organizationId));
    childLogger({ module: "byok" }).warn(
      { organizationId: context.organizationId, status: error.status },
      "BYOK key rejected by OpenRouter — key disabled, calls fall back to the platform key",
    );
  };
}
