# @mullion/db

> The Postgres persistence layer: Drizzle schema, migrations, and a pooled client factory.

Defines both the auth (Better Auth) and application tables, plus a single `createDb` factory that returns a connection-pooled Drizzle client.

## High-level idea

One package owns the entire database surface: schema, migrations, and the client factory. Every other service imports its tables from here. No table is defined twice anywhere. JSONB columns are stored untyped on purpose. Their shapes are owned and validated by [`@mullion/schemas`](../schemas) at the read/write boundary.

The client is plain node-postgres over TCP (`pg.Pool`, max 20, fail-fast timeouts), not Neon's serverless driver. This API runs as a persistent Node process, so the serverless driver buys nothing. Point `DATABASE_URL` at Neon's pooled connection string.

## Schema areas

| Area | Tables | Notes |
|---|---|---|
| Auth (Better Auth + org plugin) | `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation` | `session` carries `activeOrganizationId`. `account` holds per-user OAuth tokens, including the GitHub `repo` token (ADR-22/36) |
| Planning | `planning_sessions`, `mcq_rounds`, `requirements_docs`, `build_specs`, `graph_nodes`, `graph_edges`, `decision_log` | One active session per user via a partial unique index (ADR-29). `build_specs` is immutable via a trigger. MCQ is capped at 2 rounds |
| Build execution | `runs`, `tasks`, `messages`, `deliveries` | `runs` implements the ADR-13 status state machine, one active per user. `messages.seq` (bigserial) gives replay order |
| Cross-cutting | `model_routing`, `cost_events`, `stream_events` | Role-to-model routing (ADR-25), cost capture (ADR-28), SSE backfill log |

Multi-tenancy (ADR-36): every app table carries a denormalized non-null `organization_id`, and child tables use composite `(id, organization_id)` foreign keys. A child row can never end up in a different org than its parent.

## Layout

| File | What |
|---|---|
| `src/client.ts` | `createDb(databaseUrl)`, plus the `Db` and `Tx` types |
| `src/schema/auth.ts` | Better Auth tables |
| `src/schema/app.ts` | Application tables |
| `drizzle/` | Migrations 0000 to 0006 (`0002_build-specs-immutable.sql` is hand-written: the immutability trigger) |
| `drizzle.config.ts` | drizzle-kit config, needs `DATABASE_URL` |

## Exports

- `.`: `createDb`, `Db`, `Tx`, and the `schema` namespace
- `./schema`: all table definitions and enums

## Configuration

`DATABASE_URL` (passed to `createDb` by the caller; drizzle-kit reads it directly).

```
pnpm db:generate   # generate migration from schema diff
pnpm db:migrate    # apply migrations
pnpm db:push       # push schema directly (dev only)
```

## Where it fits

The foundation. Consumed by `apps/api`, `@mullion/orchestrator`, `@mullion/agents`, `@mullion/evals`, and `@mullion/llm`.

## Testing

No unit tests here. Verification is `check-types` plus the DB constraints and migrations themselves. Behavior is exercised through the consumers' test suites.
