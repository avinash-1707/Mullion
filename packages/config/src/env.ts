import { z } from "zod";

/**
 * Every env var the API process needs, validated at startup
 * (CODING_STANDARDS §7) — a missing value fails the boot, never
 * surfaces as `undefined` three layers deep.
 */
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  // Structured logging (ADR-63). LOG_FORMAT defaults by NODE_ENV in the
  // transform below: pretty for development, JSON everywhere else (test
  // included — pino-pretty's worker thread has no place in a test run).
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  LOG_FORMAT: z.enum(["json", "pretty"]).optional(),
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
  // LLM record/replay cache (ADR-11, 02 §10.1). `record` captures every call
  // to a cassette; `replay` serves only from cassettes and hard-fails on a
  // miss. Dev/test only — production must always be `off` (superRefine below).
  LLM_REPLAY_MODE: z.enum(["off", "record", "replay"]).default("off"),
  LLM_CASSETTE_DIR: z.string().min(1).default("./.llm-cassettes"),
  // Per-org rolling-24h combined (LLM + sandbox) spend ceiling — the org
  // half of ADR-31's circuit breaker (was ADR-43's stopgap; same knob).
  ORG_DAILY_LLM_BUDGET_USD: z.coerce.number().positive().default(10),
  // Per-run combined spend ceiling (ADR-31) — bounds a single build's total
  // LLM + sandbox cost independently of the org window.
  RUN_BUDGET_USD: z.coerce.number().positive().default(5),
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
  // Temporal (ADR-10/50): local `temporal server start-dev` by default; no
  // Cloud creds. gRPC frontend address + namespace.
  TEMPORAL_ADDRESS: z.string().min(1).default("localhost:7233"),
  TEMPORAL_NAMESPACE: z.string().min(1).default("default"),
  // Artifact store (ADR-53): local fs by default; s3 deferred (no creds).
  ARTIFACT_STORE: z.enum(["local", "s3"]).default("local"),
  ARTIFACT_DIR: z.string().min(1).default("./.artifacts"),
  ARTIFACT_S3_BUCKET: z.string().min(1).optional(),
  // Retention TTL for produced trees + delivery blobs — the worker sweeps
  // anything older on a timer so local-fs disk can't grow unbounded across
  // runs (Phase 3 audit). Default 7 days; S3 uses a bucket lifecycle rule.
  ARTIFACT_RETENTION_MS: z.coerce.number().int().positive().default(7 * 24 * 60 * 60_000),
  // GitHub delivery (ADR-56): optional OAuth app for linkSocial; absence is
  // SOFT (GitHub push is an optional target, unlike SANDBOX_DRIVER=e2b).
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  // Delivery: which GitHub target — `fake` (no creds, local remote) or the
  // real Octokit push. Archive is always offered alongside.
  GITHUB_DELIVERY: z.enum(["fake", "github"]).default("fake"),
}).superRefine((env, ctx) => {
  if (env.ARTIFACT_STORE === "s3" && !env.ARTIFACT_S3_BUCKET) {
    ctx.addIssue({
      code: "custom",
      path: ["ARTIFACT_S3_BUCKET"],
      message: "required when ARTIFACT_STORE=s3 — set it or use ARTIFACT_STORE=local",
    });
  }
  if (env.GITHUB_DELIVERY === "github" && !(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)) {
    // BOTH are required — auth.ts only registers the provider (so a user can
    // link) when both are present; ID alone would silently degrade to
    // archive-only with no way to link.
    ctx.addIssue({
      code: "custom",
      path: ["GITHUB_CLIENT_SECRET"],
      message: "GITHUB_DELIVERY=github requires BOTH GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET (or use GITHUB_DELIVERY=fake)",
    });
  }
  if (env.NODE_ENV === "production") {
    // Better Auth only marks session cookies Secure (and __Secure- prefixed)
    // when its baseURL is https — a production deploy on plain http would
    // silently ship session tokens over cleartext (Phase 3 verification).
    for (const key of ["API_ORIGIN", "WEB_ORIGIN"] as const) {
      if (!env[key].startsWith("https://")) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "must be https in production — session cookie Secure flag depends on it",
        });
      }
    }
    // The loopback mock belongs to dev only; llm.ts already gates the
    // wiring on NODE_ENV, but a set value in production is a misconfig
    // worth failing on, not silently ignoring (Phase 3 audit).
    if (env.OPENROUTER_BASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["OPENROUTER_BASE_URL"],
        message: "dev-only mock override — unset it in production",
      });
    }
    // Neon requires TLS; a plain connection string in production would move
    // session tokens and specs over cleartext (Phase 3 audit).
    if (!/sslmode=(require|verify-full|verify-ca)/.test(env.DATABASE_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "production requires sslmode=require (or verify-full/verify-ca)",
      });
    }
  }
  if (env.NODE_ENV === "production" && env.LLM_REPLAY_MODE !== "off") {
    ctx.addIssue({
      code: "custom",
      path: ["LLM_REPLAY_MODE"],
      message: "record/replay is a dev/test tool (ADR-11) — production must run with LLM_REPLAY_MODE=off",
    });
  }
  // Fail loud at boot, never mid-run with a half-built task.
  if (env.SANDBOX_DRIVER === "e2b" && !env.E2B_API_KEY) {
    ctx.addIssue({
      code: "custom",
      path: ["E2B_API_KEY"],
      message: "required when SANDBOX_DRIVER=e2b — set it or use SANDBOX_DRIVER=local",
    });
  }
}).transform((env) => ({
  ...env,
  LOG_FORMAT: env.LOG_FORMAT ?? (env.NODE_ENV === "development" ? ("pretty" as const) : ("json" as const)),
}));

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
