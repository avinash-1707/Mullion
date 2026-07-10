import { OpenRouterClient } from "@mullion/llm";
import { db } from "./db.js";
import { env } from "./env.js";

// One client instance — routing cache and cost capture stay in one place.
export const llm = new OpenRouterClient({
  apiKey: env.OPENROUTER_API_KEY,
  db,
  referer: env.API_ORIGIN,
  ...(env.NODE_ENV !== "production" && env.OPENROUTER_BASE_URL
    ? { baseUrl: env.OPENROUTER_BASE_URL }
    : {}),
});
