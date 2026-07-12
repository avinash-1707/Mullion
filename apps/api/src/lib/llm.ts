import { OpenRouterClient } from "@mullion/llm";
import { db } from "./db.js";
import { env } from "../config/env.js";
import { llmFetchImpl } from "./llm-fetch.js";
import { byokApiKeyResolver, disableByokKeyOnAuthFailure } from "../modules/settings/byok.js";

// One client instance — routing cache and cost capture stay in one place.
export const llm = new OpenRouterClient({
  apiKey: env.OPENROUTER_API_KEY,
  db,
  referer: env.API_ORIGIN,
  // ADR-70: an org with an enabled BYOK key pays with it; auth failure on
  // that key disables it and falls back to the platform key.
  apiKeyResolver: byokApiKeyResolver(db),
  onByokAuthFailure: disableByokKeyOnAuthFailure(db),
  ...(env.NODE_ENV !== "production" && env.OPENROUTER_BASE_URL
    ? { baseUrl: env.OPENROUTER_BASE_URL }
    : {}),
  ...(llmFetchImpl ? { fetchImpl: llmFetchImpl } : {}),
});
