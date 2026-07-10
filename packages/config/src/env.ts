import { z } from "zod";

/**
 * Every env var the API process needs, validated at startup
 * (CODING_STANDARDS §7) — a missing value fails the boot, never
 * surfaces as `undefined` three layers deep.
 */
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  // Origin the API itself is served from (Better Auth baseURL).
  API_ORIGIN: z.string().url(),
  // Next.js origin, for CORS + Better Auth trustedOrigins.
  WEB_ORIGIN: z.string().url(),
  OPENROUTER_API_KEY: z.string().min(1),
  // Number of reverse proxies in front of the API. 0 (default) = trust the
  // socket address only; N>0 = take the Nth hop from the right of
  // x-forwarded-for. Never trust the leftmost value — it's client-supplied.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

export function parseApiEnv(source: Record<string, string | undefined>): ApiEnv {
  const parsed = apiEnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
