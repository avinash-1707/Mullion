# Mullion — Progress Tracker

## 0. How to use this file

This tracks **execution** — what's actually been built, in what phase,
and any real-world deviations discovered along the way. It's the
companion to two other docs, and it's worth being precise about the
difference so entries land in the right place:

- **`docs/specs/04_design_decisions_log.md`** is the historical record of decisions
  made *before* any code existed. If something here represents a genuine
  new decision (not just an update on progress against an existing one),
  it needs a new ADR there too — this file should reference it, not
  duplicate its reasoning.
- **`docs/specs/05_build_plan.md`** defines the five phases and what belongs in each.
  The status table below tracks progress against that plan; it doesn't
  redefine what the phases are.

Every entry in the log (§2) should be able to answer: what happened, does
it match the spec or deviate from it, and if it deviates, is there a new
ADR for that.

---

## 1. Phase status at a glance

| Phase | Status | Last updated | Notes |
|---|---|---|---|
| Phase 0 — Foundation & Platform Wiring | Done (1 DoD item pending creds) | 2026-07-10 | Built + verified live; OpenRouter round-trip awaits a real API key; Neon swap-in is a DATABASE_URL change |
| Phase 1 — Interactive Planning Experience | Not started | 2026-07-10 | Blocked on Phase 0 |
| Phase 2 — Automated Build Pipeline | Not started | 2026-07-10 | Blocked on Phase 1 |
| Phase 3 — Observability, Evaluation & Hardening | Not started | 2026-07-10 | Blocked on Phase 2 |
| Phase 4 — Polish & Fast-Follow | Not started | 2026-07-10 | Blocked on Phase 3 |

Update this table's **Status** column as work happens: `Not started` →
`In progress` → `Done`. Keep **Last updated** current — a stale date here
is worse than no table at all.

---

## 2. Log

Execution log starts when building starts (Phase 0). The planning stage is
fully recorded elsewhere: decisions in
`docs/specs/04_design_decisions_log.md` (ADR-01 through ADR-36), scope and
sequencing in `docs/specs/05_build_plan.md` — nothing from that stage
needs to live here.

### Entry template
Copy this for every new entry. Keep entries newest-first below the
template.

```
### [YYYY-MM-DD] Short title
**Phase:** which phase this belongs to
**Type:** Progress update | Architecture change | Deviation from spec | Gap found
**Summary:** what happened, in a few sentences
**Files/areas touched:** rough pointer, not a full diff
**Related ADR:** ADR-## if this reflects or changes a logged decision;
  "New — added ADR-## to 04" if this entry introduced one; "None" if it's
  pure progress with no decision content
**Follow-ups:** anything this opens up or blocks, if relevant
```

---

### [2026-07-10] DB audit run and findings fixed
**Phase:** Phase 0 — Foundation & Platform Wiring
**Type:** Progress update + Architecture change
**Summary:** Full static DB audit (3 parallel passes: auth/tenancy,
planning core, streaming/cost) over all 16 tables and every live query
site. 1 Critical (SSE poll cursor could permanently skip events published
by a slower-committing transaction), 5 High, ~10 Medium. Everything
"matters now" was fixed in the same pass and re-verified against a fresh
local Postgres: per-stream advisory-lock publishing (ADR-38), member/
account unique indexes with idempotent org provisioning, composite
(id, organization_id) FKs pinning children to their parent's org,
build_specs immutability trigger, decision_log NOT NULL + has-parent CHECK
(ADR-39), pool error handler + timeouts, cost/verification/invitation
indexes, and a batch of small query cleanups. Deletion lifecycle
(RESTRICT) made deliberate via ADR-40. Deferred items carry explicit
triggers in the report, not silence.
**Files/areas touched:** packages/db (schema + migrations 0001/0002),
apps/api (sse, org, middleware, routes), packages/llm (client)
**Related ADR:** New — ADR-38, ADR-39, ADR-40 added to `04`
**Follow-ups:** EXPLAIN pass on SSE poll + Better Auth lookups against a
seeded DB (fold into Phase 3 verification); retention/purge jobs when
Temporal lands; Phase-2 table shapes (tasks status/deps, messages seq) per
report §3; session-history index with the Phase 1 list endpoint.

### [2026-07-10] Phase 0 built, verified, security-reviewed
**Phase:** Phase 0 — Foundation & Platform Wiring
**Type:** Progress update
**Summary:** Full Phase 0 scope built and verified against a live (local
Docker) Postgres: Turborepo monorepo (`apps/web`, `apps/api`,
`packages/{schemas,db,llm,config}`); Hono on persistent Node with CORS
(credentials, exact origin) + per-IP/per-user rate limits on every route
including SSE; Better Auth at `/api/auth/*` with the organization plugin,
email/password sign-in, and transactional personal-org provisioning at
signup; Drizzle schema for all core + placeholder tables with non-null
`organization_id` and ADR-29's partial unique indexes; OpenRouter client
in `packages/llm` (role→model table, `zdr: true` hardcoded, no `models[]`
fallback array so a silent model swap is structurally impossible, cost
captured to `cost_events`); reusable SSE infra with `Last-Event-ID`
Postgres backfill. Frontend shell (landing, sign-in/up, walled dashboard)
uses TanStack Query for API handling per owner directive. DoD verified by
direct API calls: personal org at signup, org invitations end to end,
second active session rejected by the DB and existing one returned,
cross-org reads/streams 404, SSE replay from `Last-Event-ID` exact,
rate-limit 429s, zero model slugs outside `packages/llm/default-routing.ts`.
Phase-end security review (per `CODING_STANDARDS.md` §11) found no
Critical/High; all four Medium findings fixed and re-verified live:
trusted-proxy-aware client IP (`TRUSTED_PROXY_HOPS`, XFF spoof no longer
rotates buckets), `/api/dev/*` gated out of production, org provisioning
made transactional with middleware self-heal for zero-membership accounts,
per-user SSE concurrent-connection cap (5) + 30-min max lifetime. Two Lows
also fixed (SSE event-type newline sanitization; duplicate-session
fallback now org-scoped, 409 on cross-org).
**Files/areas touched:** whole repo (initial build)
**Related ADR:** New — added ADR-37 to `04` (personal-org creation via
databaseHooks with direct DB inserts; Better Auth has no built-in option)
**Follow-ups:**
- OpenRouter hello-world DoD needs a real `OPENROUTER_API_KEY`; dev DB is
  local Docker Postgres — swap `DATABASE_URL` to Neon when provisioned.
- Prod cookie topology (security review L1): deploy web + API under one
  parent domain to keep `SameSite=Lax`, or set `SameSite=None; Secure` and
  add CSRF tokens to mutating routes — decide before first deploy.
- Cost-write-after-spend policy (L3) lands with real budget enforcement
  (ADR-31, Phase 2). Rate-limit store goes Redis with a second instance.
