# apps/api

> The backend hub: Hono HTTP API plus a separate Temporal build-worker process.

Handles auth, planning sessions, build runs, SSE streaming, and delivery. Sits in front of the agent orchestrator.

## High-level idea

Two processes from one codebase:

- **`src/index.ts`** is the HTTP server. It starts OTel, validates env at boot (`@mullion/config`, fails fast on bad config), seeds model routing, serves the Hono app, and shuts down gracefully.
- **`src/worker.ts`** is the Temporal build worker (ADR-50). It wires the real dependencies (LLM client, sandbox driver, artifact store, delivery targets) into `createBuildWorker` from `@mullion/orchestrator`, and sweeps stale sandbox containers on a timer.

The middleware stack (`src/app.ts`) runs in this order: logger, tracing, CORS, rate limits (per IP, session, user, and credential, spec 02 §7.1.1), then session. Better Auth is mounted at `/api/auth/*` with the organization plugin. Every signup gets a personal org (ADR-36). GitHub OAuth is link-only: it is blocked as a sign-in method and used only for delivery push tokens, which are encrypted at rest.

## Routes

| Group | Routes |
|---|---|
| `/api/auth/*` | Better Auth (sign-in/up, session, org), credential rate-limited |
| `/api/sessions` | `POST /`, `GET /:id`, `GET /:id/snapshot`, `GET /:id/stream` (SSE), `POST /:id/answers` · `/proceed` · `/edit` · `/retry` · `/confirm` · `/abandon`, `GET /:id/export` |
| `/api/builds` | `POST /`, `GET /`, `GET /:id`, `GET /:id/tasks`, `GET /:id/stream` (SSE), `POST /:id/escalate` |
| `/api/github` | `GET /connection` |
| `/api/dev` | `POST /llm-hello`, dev/test only, gated by NODE_ENV |
| `/health` | Liveness |

SSE (`src/sse.ts`): polls the `stream_events` table with heartbeats, backfill is org-scoped, clients resume with `Last-Event-ID`, connections are capped per user and live at most 30 minutes.

## Layout

| Path | What |
|---|---|
| `src/planning/` | The planning domain: flows, state machine, confirm/freeze, diagram, export, snapshots, content hashing |
| `src/middleware/` | Rate limits, session (`AuthVariables`), tracing |
| `src/github/` | Encrypted token retrieval, sign-in guard |
| `src/llm.ts`, `src/llm-fetch.ts` | OpenRouter client wiring: record/replay, budget enforcement |
| `src/temporal.ts` | Lazily connected Temporal client with the OTel workflow interceptor |
| `src/dev/` | CLI helpers (`build-task-cli.ts`, `verify-zdr-cli.ts`) |

## Run

```
cp .env.example .env      # see packages/config/src/env.ts for the full validated set
pnpm dev                  # HTTP API on :8787 (tsx watch)
pnpm worker               # Temporal build worker (separate terminal)
```

Local prerequisites: Postgres (`DATABASE_URL`), `temporal server start-dev`, and Docker (for the local sandbox driver). Real OpenRouter, E2B, S3, and GitHub credentials are all optional. Every external service has a local or fake driver picked by env.

## Testing

Vitest. `pnpm test` runs unit tests (planning confirm, GitHub token and guard, and more). `pnpm test:integration` adds `app.integration.test.ts`, which exercises the full HTTP surface against real Postgres.
