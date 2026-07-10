import { Hono } from "hono";
import { OpenRouterClient } from "@mullion/llm";
import { db } from "../db.js";
import { env } from "../env.js";
import { requireOrgMember, type RequiredAuthVariables } from "../middleware/session.js";

const openRouter = new OpenRouterClient({
  apiKey: env.OPENROUTER_API_KEY,
  db,
  referer: env.API_ORIGIN,
});

/**
 * Phase 0 Definition-of-Done probe: a trivial prompt round-trips through
 * OpenRouter via the role config and returns cost metadata. Auth-gated like
 * everything else — it spends real credits.
 */
export const devRoute = new Hono<{ Variables: RequiredAuthVariables }>()
  .use(requireOrgMember)
  .post("/llm-hello", async (c) => {
    const user = c.get("user");
    const organizationId = c.get("organizationId");
    const result = await openRouter.completeChat({
      role: "analyst",
      messages: [{ role: "user", content: "Reply with exactly: hello world" }],
      maxTokens: 32,
      costContext: { organizationId, userId: user.id },
    });
    return c.json({
      content: result.content,
      model: result.model,
      generationId: result.generationId,
      cost: result.cost,
      usage: result.usage,
    });
  });
