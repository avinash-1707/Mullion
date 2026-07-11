# @mullion/config

> Env schema validated at boot, plus shared TypeScript base configs.

A missing or malformed env var fails the boot loudly. It never surfaces as `undefined` three layers deep in a request (CODING_STANDARDS §7).

## High-level idea

`src/env.ts` is the single declaration of every knob the API process accepts: database, auth, origins, OpenRouter, LLM record/replay, per-org and per-run budgets (ADR-31), trusted proxy hops, sandbox driver (ADR-44), Temporal, artifact store (ADR-53), retention TTL, and GitHub delivery (ADR-56). `apps/api/src/env.ts` is a one-liner that calls `parseApiEnv(process.env)`.

Beyond shape checks, `superRefine` enforces cross-field and production rules:

- Production requires **https** origins (the session cookie's `Secure` flag depends on it), `sslmode=require` on `DATABASE_URL`, replay mode `off`, and no loopback LLM mock.
- `ARTIFACT_STORE=s3` requires a bucket. `SANDBOX_DRIVER=e2b` requires `E2B_API_KEY`. `GITHUB_DELIVERY=github` requires **both** the OAuth client id and secret.
- Failures happen at boot, never mid-run with a half-built task.

## Layout

| File | What |
|---|---|
| `src/env.ts` | `apiEnvSchema`, `parseApiEnv()`, `ApiEnv` |
| `tsconfig/base.json`, `tsconfig/node-package.json` | Shared TS configs, consumed via package exports |

## Exports

- `./env`: `apiEnvSchema`, `parseApiEnv()`, `ApiEnv`
- `./tsconfig/base`, `./tsconfig/node-package`: shared TS configs

## Where it fits

Consumed by `apps/api` (env) and by every package's tsconfig. Depends on `zod` only.

## Testing

`check-types` only. It is a config-only package, and the rules are exercised by the API's boot and tests.
