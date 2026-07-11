/**
 * ADR-27 live verification (Phase 3 build-plan DoD): prove the `zdr: true`
 * provider constraint demonstrably restricts routing against REAL OpenRouter
 * responses, not just in our request config. Needs a live OPENROUTER_API_KEY
 * — refuses mocks and production.
 *
 * Usage (from apps/api): pnpm exec tsx --env-file=.env src/dev/verify-zdr-cli.ts
 *
 * For every model slug in model_routing:
 *  1. Fetch the model's endpoint list and collect which providers OpenRouter
 *     itself marks ZDR-eligible.
 *  2. Make a real (1-token, synthetic "ping") completion with the app's own
 *     client — zdr:true is hardcoded there — and read back which provider
 *     actually served it.
 *  3. PASS iff the serving provider is in the ZDR-eligible set. If the
 *     endpoints API doesn't expose a recognizable ZDR/data-policy field,
 *     fail loudly with the raw shape for manual review — never infer a pass.
 */
import { z } from "zod";
import { schema } from "@mullion/db";
import { OpenRouterClient } from "@mullion/llm";
import { db, pool } from "../db.js";
import { env } from "../env.js";

const endpointsResponseSchema = z.object({
  data: z.object({
    endpoints: z.array(
      z
        .object({
          name: z.string().optional(),
          provider_name: z.string().optional(),
          // OpenRouter has exposed ZDR eligibility under endpoint data
          // policies; accept either spelling and treat absence as unknown.
          data_policy: z
            .object({
              zdr: z.boolean().optional(),
              retains_prompts: z.boolean().optional(),
            })
            .optional(),
        })
        .loose(),
    ),
  }),
});

async function main(): Promise<void> {
  if (env.NODE_ENV === "production") {
    throw new Error("verify-zdr-cli is a dev verification harness — refusing to run in production");
  }
  if (env.OPENROUTER_BASE_URL) {
    throw new Error(
      "OPENROUTER_BASE_URL is set (mock) — ADR-27 verification is only meaningful against the real API; unset it and provide a live OPENROUTER_API_KEY",
    );
  }

  const routing = await db.select().from(schema.modelRouting);
  if (routing.length === 0) throw new Error("model_routing is empty — seed it first");
  const slugs = [...new Set(routing.map((r) => r.modelSlug))];
  const roleForSlug = (slug: string): string =>
    routing.find((r) => r.modelSlug === slug)?.role ?? "analyst";

  const client = new OpenRouterClient({ apiKey: env.OPENROUTER_API_KEY, db, referer: env.API_ORIGIN });

  let failures = 0;
  for (const slug of slugs) {
    const endpointsRes = await fetch(`https://openrouter.ai/api/v1/models/${slug}/endpoints`, {
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
    });
    if (!endpointsRes.ok) {
      console.error(`✗ ${slug}: endpoints lookup failed (${endpointsRes.status})`);
      failures += 1;
      continue;
    }
    const parsed = endpointsResponseSchema.safeParse(await endpointsRes.json());
    if (!parsed.success) {
      console.error(`✗ ${slug}: endpoints response shape unrecognized — verify manually:\n${parsed.error.message}`);
      failures += 1;
      continue;
    }
    const endpoints = parsed.data.data.endpoints;
    const withPolicy = endpoints.filter((e) => e.data_policy?.zdr !== undefined);
    if (withPolicy.length === 0) {
      console.error(
        `✗ ${slug}: no endpoint exposes a data_policy.zdr field — API shape changed; ` +
          `providers seen: ${endpoints.map((e) => e.provider_name ?? e.name ?? "?").join(", ")} — verify manually`,
      );
      failures += 1;
      continue;
    }
    const zdrProviders = new Set(
      withPolicy
        .filter((e) => e.data_policy?.zdr === true)
        .map((e) => (e.provider_name ?? e.name ?? "").toLowerCase()),
    );

    // The app's own client — zdr:true hardcoded, no fallback array (ADR-26/27).
    const result = await client.completeChat({
      role: roleForSlug(slug) as (typeof routing)[number]["role"],
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 1,
      costContext: { organizationId: "eval-org" },
    });
    // OpenRouter returns the serving provider on the generation; the client
    // surfaces model + generationId — read the provider via the generation
    // endpoint to avoid widening the client's parsed surface for a dev tool.
    const genRes = await fetch(`https://openrouter.ai/api/v1/generation?id=${result.generationId}`, {
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
    });
    const gen = z
      .object({ data: z.object({ provider_name: z.string() }).loose() })
      .safeParse(await genRes.json());
    if (!gen.success) {
      console.error(`✗ ${slug}: generation lookup failed for ${result.generationId} — verify manually`);
      failures += 1;
      continue;
    }
    const served = gen.data.data.provider_name;
    if (zdrProviders.has(served.toLowerCase())) {
      console.log(`✓ ${slug}: served by "${served}" — in the ZDR-eligible set {${[...zdrProviders].join(", ")}}`);
    } else {
      console.error(
        `✗ ${slug}: served by "${served}" which is NOT in the ZDR-eligible set {${[...zdrProviders].join(", ")}} — ADR-27 violated`,
      );
      failures += 1;
    }
  }

  if (failures > 0) {
    console.error(`\nZDR verification FAILED for ${failures}/${slugs.length} slug(s)`);
    process.exitCode = 1;
  } else {
    console.log(`\nZDR verification passed for all ${slugs.length} routed slug(s) (ADR-27)`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void pool.end());
