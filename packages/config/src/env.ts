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
  // Dev/test only: point the LLM client at a local mock server (the full
  // record/replay cache is Phase 3, ADR-11). Restricted to loopback so a
  // deploy that forgot NODE_ENV=production still can't ship the API key to
  // an arbitrary host (security review Phase 1).
  OPENROUTER_BASE_URL: z
    .string()
    .url()
    .regex(/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/, "must point at loopback")
    .optional(),
  // Phase 1 stopgap spend ceiling per org per rolling 24h (ADR-43) — the
  // real combined budget circuit breaker is ADR-31, Phase 2.
  ORG_DAILY_LLM_BUDGET_USD: z.coerce.number().positive().default(10),
  // Number of reverse proxies in front of the API. 0 (default) = trust the
  // socket address only; N>0 = take the Nth hop from the right of
  // x-forwarded-for. Never trust the leftmost value — it's client-supplied.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  // Sandbox driver selection (ADR-44): swap local↔e2b is a config change.
  SANDBOX_DRIVER: z.enum(["local", "e2b"]).default("local"),
  E2B_API_KEY: z.string().min(1).optional(),
  // Container image for the local driver — toolchain must be baked in, the
  // sandbox has no network (ADR-47).
  SANDBOX_IMAGE: z.string().min(1).default("node:22-bookworm-slim"),
  // $/second modeling the sandbox provider rate (~E2B 2vCPU/512MB), so the
  // combined cost path (ADR-28, §5.1) is exercised even on free local Docker.
  SANDBOX_COST_USD_PER_SEC: z.coerce.number().positive().default(0.000042),
}).superRefine((env, ctx) => {
  // Fail loud at boot, never mid-run with a half-built task.
  if (env.SANDBOX_DRIVER === "e2b" && !env.E2B_API_KEY) {
    ctx.addIssue({
      code: "custom",
      path: ["E2B_API_KEY"],
      message: "required when SANDBOX_DRIVER=e2b — set it or use SANDBOX_DRIVER=local",
    });
  }
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
