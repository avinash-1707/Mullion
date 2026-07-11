# Mullion — Design Decisions Log

## 0. What this document is

Every other spec document (`01`, `02`, `03`) describes the *current state*
of the design. This document instead records *how it got there* — every
decision made during the planning stage, in the order they came
up, with the alternative(s) considered and who actually made the call.

There's a deliberate parallel here worth naming: the product itself
maintains a Decision Log (`02_system_architecture_spec.md` §4.1) that does
exactly this for a user's architecture-planning session — every decision,
tagged `source: agent | user`, with rationale and alternatives. This
document is that same idea, one level up, for the project itself.

### Scope: architecture decisions only
This log holds decisions that shape the **system itself** — what gets
built, which technology, which tradeoff, which mechanism. Development
process and workflow conventions (how dependencies get installed, when to
check documentation, when a security review runs, code style) belong in
`docs/CODING_STANDARDS.md` instead. If an entry here doesn't change what the
software *is*, it's in the wrong document.

### Status legend
- ✅ **Confirmed by owner** — answered directly, usually via the MCQ tool
- 🔧 **Designed by Claude, adopted** — proposed as a recommendation, not
  objected to, now load-bearing in the spec docs
- ⚠️ **Default assumption — not yet confirmed** — a default picked without
  owner input, and flagged; these are the items most worth a second look

### Open items requiring the owner's explicit sign-off
All previously flagged defaults are now resolved (ADR-21 and ADR-27
confirmed 2026-07-10). One low-stakes designed default remains, fine to
tune with real usage:
- **ADR-05** — MCQ question round/count caps

---

## A. Product & UX flow

### ADR-01 — Four-phase interactive planning experience, then a fork
**Status:** ✅ Confirmed by owner (original request)
**Decision:** Idea intake → capped MCQ requirements clarification → live,
editable architecture planning (diagram + decision log) → explicit
confirmation → fork into spec-export vs. automated build.
**Doc:** `01_product_ux_flow_spec.md` §1

### ADR-02 — Free-text edits allowed only during planning, not during build
**Status:** ✅ Confirmed by owner
**Alternatives considered:** allowing edits any time, including mid-build.
**Rationale:** mid-build edits would require injecting changes into a
running Temporal workflow and re-planning affected tasks live — real added
complexity for a capability you explicitly didn't need.
**Doc:** `01` §0 (decision 1), `02_system_architecture_spec.md` §3.1

### ADR-03 — Architecture view renders as diagram + decision log together
**Status:** ✅ Confirmed by owner
**Alternatives considered:** diagram only; decision log only.
**Doc:** `01` §4.1

### ADR-04 — Delivery is archive + GitHub push; no live hosting in v1
**Status:** ✅ Confirmed by owner
**Alternatives considered:** archive-only; also offering live hosting/deploy.
**Rationale:** live hosting means ongoing per-user infrastructure cost with
no pricing model yet to offset it — deferred (`03_future_improvements_v2.md`
item B5).
**Doc:** `01` §7, `02` §11

### ADR-05 — MCQ clarification capped at 2 rounds, ~5 questions/round
**Status:** 🔧 Designed by Claude, adopted — not directly asked
**Rationale:** unbounded interrogation is worse UX than proceeding with a
stated, editable assumption. Anything unresolved after the cap is written
into the Requirements Document as an explicit assumption rather than
triggering a third round.
**Doc:** `01` §3, `02` §2.2

### ADR-06 — Consistency check gates "Confirm Architecture"
**Status:** 🔧 Designed by Claude, adopted
**Decision:** A lightweight Reviewer-style pass checks for contradictions
(dangling dependencies, orphaned nodes) before confirmation is allowed;
found issues block confirmation with an itemized list rather than being
silently resolved.
**Doc:** `01` §4.3, `02` §2.3

### ADR-07 — Escalation gates are separate from Phase 2 editing
**Status:** 🔧 Designed by Claude, carried forward from the original
spec's failure-mode handling and clarified once ADR-02 made the
distinction necessary
**Decision:** A stuck build task (retry budget exhausted) surfaces a
narrow approve/redirect/abandon choice — not a route back into open
re-architecture, and visually distinct in the UI from Phase 2 editing.
**Doc:** `01` §5, `02` §3.1

---

## B. Core backend architecture

### ADR-08 — Vector DB replaced with a structured Postgres decision log
**Status:** 🔧 Designed by Claude, adopted
**Alternatives considered:** keep pgvector/Qdrant as originally specced.
**Rationale:** semantic retrieval was solving a problem this system isn't
big enough to have yet; a plain structured table does the job and — once
the interactive UX was added — turned out to double as the live Phase 2
feed for free.
**Doc:** `02` §4.1

### ADR-09 — E2B (managed) instead of a self-hosted Firecracker/gVisor fleet
**Status:** 🔧 Designed by Claude, adopted
**Rationale:** self-hosting only becomes cost-effective above a real usage
volume; no reason to carry that ops burden before there's usage to justify
it. Self-hosting deferred (`03` item B1).
**Doc:** `02` §6

### ADR-10 — Temporal Cloud instead of self-hosted Temporal
**Status:** 🔧 Designed by Claude, adopted
**Rationale:** keeps the durable-execution guarantee without cluster ops
(backing store, worker fleet, versioning discipline) before usage
justifies it. Self-hosting deferred (`03` item B2).
**Doc:** `02` §7.2

### ADR-11 — LLM response record/replay cache for development
**Status:** 🔧 Designed by Claude, adopted
**Doc:** `02` §10.1

### ADR-12 — Fixed 15–20 task evaluation suite
**Status:** 🔧 Designed by Claude, adopted
**Decision:** pass rate, retry count, escalation frequency, and
cost-per-task tracked per system version, so quality changes are measured
rather than impression-based.
**Doc:** `02` §10.2

### ADR-13 — Build state machine renamed `Queued→Building→...`
**Status:** 🔧 Designed by Claude, adopted — a naming necessity, not a
discretionary choice
**Rationale:** once Phase 2 introduced a user-facing "Planning" stage, the
original build pipeline's own "Planning" phase name would have collided
and confused the two very different mechanisms (open editing vs. sealed
execution).
**Doc:** `02` §0, §3

### ADR-14 — Added Analyst and Planner/Architect agent roles
**Status:** 🔧 Designed by Claude, adopted — required by ADR-01
**Doc:** `02` §5

### ADR-15 — DevOps agent scope narrowed to packaging + GitHub push only
**Status:** 🔧 Designed by Claude, adopted — consistent with ADR-04
**Doc:** `02` §5, §11

---

## C. Frontend & API stack

### ADR-16 — Next.js + Hono
**Status:** ✅ Confirmed by owner (explicit stack instruction)
**Doc:** `02` §0, §1, §13

### ADR-17 — Hono runs on persistent Node.js, not edge/Workers
**Status:** ✅ Confirmed by owner (recommendation explicitly requested, then accepted)
**Alternatives considered:** Cloudflare Workers / Vercel Edge.
**Rationale:** Temporal's TypeScript SDK requires Node.js (native
bindings, no edge support); long-lived SSE connections avoid edge
execution-time ceilings; consolidating the whole backend onto one runtime
avoids operating two.
**Doc:** `02` §7.1

### ADR-18 — Server-Sent Events instead of WebSocket or a managed realtime service
**Status:** ✅ Confirmed by owner
**Alternatives considered:** self-hosted WebSocket server; managed realtime
(Pusher/Ably).
**Rationale:** client→server traffic (answers, edit prompts) travels over
ordinary POST requests — only server→client needed streaming, so the
simpler one-way transport is sufficient.
**Doc:** `02` §2.1, §3

### ADR-19 — SSE reconnection via `Last-Event-ID` + Postgres backfill
**Status:** 🔧 Designed by Claude, adopted — technical consequence of ADR-18
**Doc:** `02` §2.1, §3

---

## D. Data & database

### ADR-20 — Neon (serverless Postgres)
**Status:** ✅ Confirmed by owner (explicit stack instruction)
**Doc:** `02` §4.2, §13

### ADR-21 — Drizzle as the ORM
**Status:** ✅ Confirmed by owner (2026-07-10) — originally a flagged
default, later confirmed directly.
**Alternatives considered:** Prisma.
**Rationale:** the standard, well-documented pairing with Hono + Better
Auth + Neon across multiple reference implementations. Isolated behind the
data-access layer, so swapping later is contained.
**Doc:** `02` §4.2, §13

---

## E. Authentication & delivery

### ADR-22 — Better Auth, mounted in the Hono service
**Status:** ✅ Confirmed by owner (explicit stack instruction)
**Doc:** `02` §8, §13

### ADR-23 — GitHub connection is always separate from sign-in
**Status:** ✅ Confirmed by owner
**Alternatives considered:** reusing the GitHub identity if the user
happened to sign in with GitHub.
**Mechanism:** Better Auth's `linkSocial({ provider: "github", scopes: ["repo"] })`,
independent of whatever the user used to authenticate.
**Doc:** `02` §8.2

---

## F. LLM / agent model routing

### ADR-24 — OpenRouter as the single LLM gateway
**Status:** ✅ Confirmed by owner (explicit stack instruction)
**Rationale:** one integration point instead of per-provider SDKs;
built-in per-request cost metadata; provider-level failover without
custom code.
**Doc:** `02` §5.1, §13

### ADR-25 — Role→model mapping as config, not hardcoded
**Status:** 🔧 Designed by Claude, adopted
**Decision:** Analyst/Planner/Reviewer on a reasoning tier, Coder/Tester/
DevOps on a fast/cheap tier, stored in a small config table so the eval
suite (ADR-12) can test routing changes without a redeploy.
**Doc:** `02` §5.1

### ADR-26 — Fallback: same model, different provider
**Status:** ✅ Confirmed by owner
**Alternatives considered:** falling back to a genuinely different model
for broader resilience.
**Rationale/tradeoff:** favors predictable output quality over maximum
uptime. If every provider for a pinned model is down at once, the call
errors rather than silently substituting a different model — surfaced to
the calling agent via the existing retry/escalation mechanism (ADR-07),
not hidden.
**Doc:** `02` §5.1, §12

### ADR-27 — Zero-Data-Retention-only model routing
**Status:** ✅ Confirmed by owner (2026-07-10) — originally a flagged
default, confirmed after reviewing live ZDR model availability.
**Alternatives considered:** allowing any provider for broader model choice/lower cost.
**Rationale:** every agent role eventually handles content derived from the
user's idea — including generated code, not just the original prompt — so
routing stays privacy-conservative. Confirmed against OpenRouter's live
ZDR endpoint list (July 2026): the reasoning tier's natural pick (Claude)
is the only frontier family with two ZDR providers (Bedrock + Vertex), so
ADR-26's same-model/different-provider fallback genuinely works under ZDR;
the fast/cheap tier's open-weight candidates (DeepSeek/Qwen/Llama) have
3–5 ZDR hosts each. Losses (Grok, Mistral flagships, Groq/Cerebras-hosted
endpoints) are nothing the role mapping needs. No ZDR price premium —
passthrough provider rates.
**Notes for implementation:** first-party Anthropic/OpenAI/Google-AI-Studio
endpoints are *not* ZDR — ZDR routes via Bedrock/Vertex/Azure. The live
authoritative list is `GET https://openrouter.ai/api/v1/endpoints/zdr`.
Third-party ZDR status is contractual, not audited — consider pairing
`zdr: true` with a provider allowlist of vetted hosts; Phase 3 verifies
actual routing against real responses (`05` Phase 3).
**Doc:** `02` §5.1

### ADR-28 — Cost tracking reads OpenRouter's own metadata
**Status:** 🔧 Designed by Claude, adopted
**Decision:** the budget circuit breaker reads `total_cost`/`usage` from
OpenRouter's response directly rather than maintaining an internal
per-provider pricing table.
**Doc:** `02` §5.1, §9

---

## G. Deferred decisions (v2)

Every deferral below was itself a decision — to *not* build something now
— made on cost/userbase-crossover grounds rather than coding effort. Full
rationale for each lives in `03_future_improvements_v2.md`; listed here
only for completeness:

multi-tenant billing (A1) · enterprise SSO/custom RBAC (A2 — rescoped by
ADR-36, which pulled the base org layer into v1) · concurrent
multi-user session editing (A3) · template marketplace (A4) · multi-region
deployment (A5) · compliance certifications (A6) · demand-based sandbox
autoscaling (A7) · self-hosted Firecracker fleet (B1) · self-hosted
Temporal (B2) · dedicated warm sandbox pools (B3) · fine-tuned smaller
models (B4) · live hosting/deployment (B5) · volume/enterprise pricing (B6)
· Neon → self-hosted Postgres (B7) · direct-provider OpenRouter-outage
bypass (B8)

---

## H. Gap-check round

Found during a deliberate pass over Docs 01–03 looking for anything that
would silently fall back to a framework default rather than an actual
decision. One item (ADR-29) needed owner input; the rest had an
unambiguous correct shape and were fixed directly.

### ADR-29 — One active planning session + one active build per user
**Status:** ✅ Confirmed by owner
**Alternatives considered:** allowing multiple concurrent sessions/builds
per user account.
**Mechanism:** enforced as a database constraint (partial unique index),
not just an application-level check — see ADR note in `02` §4.4.
**Doc:** `02` §4.4, `01` §0 (decision 4)

### ADR-30 — Phase 2 LLM-call failures use simple retry + manual button, not escalation gates
**Status:** 🔧 Designed by Claude, adopted — a genuine gap, not previously decided either way
**Rationale:** Phase 2 is human-attended, unlike the unattended Phase 3
build — the heavier retry-budget/escalation machinery exists specifically
to surface stuck *unattended* work to a human; here the human is already
watching, so a plain retry-with-backoff and a manual "try again" affordance
is sufficient and simpler.
**Doc:** `01` §4.5, `02` §2.4, §12

### ADR-31 — Budget circuit breaker combines LLM (OpenRouter) + sandbox (E2B) cost into one figure
**Status:** 🔧 Designed by Claude, adopted — fixes a gap where the circuit
breaker only accounted for LLM spend
**Rationale:** a run can blow its budget on sandbox time alone; tracking it
separately from LLM cost would let real spend exceed what the displayed
number suggests.
**Doc:** `02` §5.1

### ADR-32 — Rate limiting and CORS explicitly assigned as Hono middleware
**Status:** 🔧 Designed by Claude, adopted — re-fixes a gap introduced when
v0's generic "API Gateway" box became "Hono directly" (ADR-17) without
carrying this responsibility forward explicitly
**Doc:** `02` §7.1.1, §13

### ADR-33 — Partial/abandoned builds get identical delivery options to full success
**Status:** 🔧 Designed by Claude, adopted — extension of the pre-existing
"never a silent dead end" principle to a case the docs hadn't made explicit
**Decision:** a partial result (build ended via an abandoned escalation
gate) is offered both the downloadable archive and GitHub push, exactly
like a full success — never downgraded to download-only.
**Doc:** `01` §7, `02` §11

### ADR-34 — Interactive planning ships completely before any build-pipeline work
**Status:** 🔧 Designed by Claude, adopted — this was already implicit in
Doc 2's M0 milestone but had never been logged here as its own decision
**Rationale:** de-risks the hardest UX problem first and produces a
standalone, shippable slice (Fork A) before the higher-technical-risk,
higher-effort build pipeline needs to exist at all.
**Doc:** `02` §14 (M0), `05_build_plan.md` §0

### ADR-35 — Sign-in required before starting a planning session
**Status:** ✅ Confirmed by owner — the original unlogged default (no auth
until Fork B, found during a doc-consistency pass) was reviewed and
**reversed**.
**Alternatives considered:** anonymous session start with the auth wall
only at Fork B (lower barrier to trying the product — the original
default).
**Rationale:** anonymous sessions had no `user_id`, so ADR-29's
one-active-session-per-user constraint could not apply to them, leaving
planning-stage LLM spend bounded only by per-IP rate limiting
(`02` §7.1.1). Requiring sign-in from Phase 0 closes that hole, gives
every session an owner and an organization (ADR-36) from its first row,
and makes cost attribution uniform across planning and build.
**Doc:** `01` §0 (assumptions), §2, §6; `02` §8.1

---

## I. Post-planning scope revisions

### ADR-36 — Multi-tenant organizations in v1
**Status:** ✅ Confirmed by owner — partially supersedes the `03` A2
deferral: the org/tenancy layer is pulled into v1; enterprise SSO and
custom RBAC remain deferred (A2, rescoped).
**Alternatives considered:** staying single-user for v1 (the original A2
deferral); building a custom org/tenancy layer instead of the auth
library's.
**Decision:**
- Tenancy via **Better Auth's organization plugin** (organizations,
  memberships, invitations, and its stock owner/admin/member roles) —
  consistent with ADR-22, no custom auth code.
- A **personal organization is auto-created at signup**, so every user is
  always acting inside exactly one org context. Every tenant-scoped table
  (`sessions`, `build_specs`, `runs`, `tasks`, `messages`, plus a
  denormalized `organization_id` on `decision_log` for cheap scoping)
  carries a **non-null `organization_id`** — one ownership model, no
  separate user-owned vs org-owned code paths.
- **Data isolation:** every query in the data-access layer is org-scoped,
  and org membership is checked in middleware before any session/build
  access — enforced at the API, not just hidden by the UI.
- **Visibility:** org members can view sessions/builds in their org; only
  the creating user edits a planning session. Concurrent multi-user
  editing remains deferred (`03` A3).
- **ADR-29 unchanged:** one active session and one active build per
  *user* — org membership doesn't relax it.
- **Budget circuit breaker is per-organization:** `02` §9's "per-tenant"
  now concretely means per-org; per-run caps unchanged.
- **GitHub tokens stay per-user** (ADR-23) — never stored or shared as an
  org credential; a build pushes with the initiating user's token.
**Doc:** `02` §4.2, §4.4, §5.1, §8, §9, §12; `01` §0, §2, §6; `03` A2;
`05` Phase 0

---

## I. Build-time decisions (found during execution, per the tracker's rule)

### ADR-37 — Personal-org creation via databaseHooks with direct DB inserts
**Status:** 🔧 Designed by Claude during Phase 0 — implementation gap in
ADR-36, not a new product decision
**Context:** Better Auth (v1.6) has **no built-in option** to auto-create
an organization at signup — `autoCreateOrganizationOnSignUp` exists only as
a dead type and was explicitly removed as unimplemented (better-auth
#4334/#4755). ADR-36's "personal organization auto-created at signup"
therefore needs an implementation mechanism chosen by us.
**Alternatives considered:** calling `auth.api.createOrganization` from the
`user.create.after` hook (fails — since Better Auth 1.3.10 signup runs
inside a DB transaction, so the API call can't see the uncommitted user
row, better-auth #4718); creating the org lazily on first API call
(rejected — every signed-in request would carry a "maybe bootstrap tenant"
branch, and ADR-36's "non-null org from the first row" would be a lie).
**Decision:** `databaseHooks.user.create.after` inserts the `organization`
+ owner `member` rows **directly via Drizzle** (not through `auth.api`),
with `metadata: {"personal": true}`. `databaseHooks.session.create.before`
stamps `activeOrganizationId` from the user's first membership.
**One consequence found live:** the signup-time auth session is created
before the hook's rows are visible, so its `activeOrganizationId` lands
null — the org-membership middleware therefore treats a null active org as
"resolve the user's first membership and heal the session row", rather
than a hard error. Membership itself is still verified against the
`member` table on every request; the session field is a cache, not the
authority.
**Doc:** `02` §8 (org plugin), `05` Phase 0; implementation in
`apps/api/src/auth.ts` and `apps/api/src/middleware/session.ts`

### ADR-38 — Per-stream advisory lock serializes SSE event commit order
**Status:** 🔧 Designed by Claude during the Phase 0 DB audit — closes a
real event-loss race, no product-visible change
**Context:** `stream_events.id` is a table-wide bigserial used as the SSE
`Last-Event-ID` cursor. Sequence values are assigned at INSERT but become
visible at COMMIT, so commit order ≠ id order: a poller can see id=9,
advance its cursor past 9, and a slower transaction's id=5 (same stream)
becomes visible afterwards — permanently undeliverable. Reachable whenever
two writers hit the same stream concurrently; near-certain in Phase 2
(multiple agents emitting to one run stream), and the window grows once
02 §2.3's "event + decision-log row in one transaction" lands.
**Alternatives considered:** Redis Streams fan-out with Postgres as
backfill only (right shape long-term, but pulls Redis wiring into Phase 0
early); xmin/snapshot settled-watermark predicates (correct but fragile —
xid casts, wraparound); per-stream sequences with gap-blocking pollers
(write contention, complexity).
**Decision:** `publishStreamEvent` takes `pg_advisory_xact_lock(
hashtextextended(stream_id, 0))` before inserting, inside the insert's
transaction. Within a stream, ids are assigned and become visible in lock
order, so the cursor can never skip an uncommitted row. Cross-stream
concurrency is unaffected. It also now accepts a transaction handle so
§2.3's paired write commits atomically with its event. Revisit toward
Redis Streams when Phase 2's message bus lands.
**Doc:** `02` §2.3; `apps/api/src/sse.ts`, `packages/db` schema comment

### ADR-39 — decision_log integrity: required columns + has-parent CHECK; TEXT-with-enum stays for evolving sets
**Status:** 🔧 Designed by Claude during the Phase 0 DB audit
**Context:** `02` §4.1's sketch left `decision`, `actor`, `phase` nullable
and both parents optional — an all-NULL "design memory" row was insertable.
Separately, some enums are DB-enforced (`planning_session_status`,
`run_status` as pgEnum) while others are TEXT with a TS-only enum — that
divergence needed to be deliberate, not accidental.
**Decision:** (1) `decision`, `actor`, `phase` are NOT NULL, and a CHECK
requires `session_id` or `build_spec_id` — an append-only memory row must
say who decided what, in which phase, for which parent. (2) `supersedes`
gets its spec'd self-FK. (3) Closed lifecycle states stay pgEnum;
open-ended sets (`phase`, `actor`, `cost_events.source`/`role`,
`model_routing.role`) deliberately stay TEXT + zod at the boundary —
they're expected to grow (e.g. `'sandbox'` cost source in Phase 2) and
pgEnum's ALTER TYPE churn buys nothing there.
**Doc:** `02` §4.1; `packages/db/src/schema/app.ts`

### ADR-40 — Org/user deletion lifecycle: RESTRICT is the deliberate v1 posture
**Status:** 🔧 Designed by Claude during the Phase 0 DB audit — records a
default that was previously silent
**Context:** Auth-plugin children (member, invitation) cascade on org
delete, but every app table (`planning_sessions`, `build_specs`,
`decision_log`, `runs`, `cost_events`, …) references org/user with NO
ACTION — so deleting an org or user with any planning/billing history is
blocked by the DB with a raw FK error. Inconsistent and undocumented =
audit finding.
**Decision:** RESTRICT is correct for v1 and now deliberate:
`decision_log` and `cost_events` are audit/billing records that must
survive; silently cascading a tenant's history away would be worse than
blocking. v1 has no account-deletion product surface. When one lands
(GDPR), it must be an explicit teardown flow — archive/export, cascade the
ephemeral tables, retain or anonymize billing — handled in the app layer
with a clean error today if attempted. Personal-org orphan cleanup and
expired-row purges (session/verification/invitation) ride the same future
job infrastructure (Temporal, Phase 2).
**Doc:** `packages/db/drizzle/0001_*.sql` FK rules; DB-audit report
`docs/db-audits/2026-07-10.md`

### ADR-41 — Planner output is streamed JSONL, one decision object per line, applied atomically per line
**Status:** 🔧 Designed by Claude during Phase 1 implementation
**Context:** `02` §2.3 requires nodes to "appear incrementally as the
Planner makes each decision" with node emission and decision-log write in
the same transaction. A plain completion would deliver the whole plan at
once (a burst after 30–60s of silence — the opposite of "watching the
system think"), while a full multi-call agent loop (one LLM call per
decision) multiplies cost and latency for no v1 benefit.
**Decision:** The Planner produces one JSON decision object per line
(JSONL) over OpenRouter's SSE streaming; a JsonlAccumulator parses each
line the moment its newline arrives, and each parsed decision commits as
one transaction: decision_log row + graph node/edge upserts + SSE events
(riding ADR-38's per-stream lock). Decisions therefore land in the UI in
generation order, seconds apart, while the model is still generating.
Same mechanism handles edit prompts (line union adds a `clarification`
variant that ends the turn). A malformed line fails the whole run
(retry with backoff, then ADR-30's manual retry) — never a
partially-applied silent plan. Usage/cost is read from the final stream
chunk (OpenRouter now always includes it; the old `usage.include` opt-in
is a documented no-op) and a stream ending without a usage chunk is
treated as a failed call, so ADR-28's cost capture can't silently skip.
**Alternatives considered:** Single completion + artificial paced emission
(dishonest latency, still one long silent wait); per-decision LLM calls
(cost/latency multiplier); streaming a single JSON document with
incremental parsing (fragile bracket-state parsing vs. trivial line
splits).
**Doc:** `02` §2.3; `packages/llm/src/client.ts` (completeChatStream),
`packages/agents/src/planner.ts`, `apps/api/src/planning/flows.ts`

### ADR-42 — Fork A bundle is rendered on demand from Postgres; S3 storage of export bundles deferred
**Status:** 🔧 Designed by Claude during Phase 1 implementation
**Context:** `02` §4.3 lists "exported spec bundles" under S3. Phase 1 has
no other S3 consumer — repos/diffs/artifacts all arrive with the Phase 2
build pipeline — so honoring that line now would add a bucket, credentials
and lifecycle config for files that are pure derivations of DB rows.
**Decision:** `GET /api/sessions/:id/export` renders the zip (markdown
docs, graph/task/decision JSON, deterministic SVG diagram) on demand from
the frozen Build Spec + decision log. The spec is immutable (0002 trigger)
so the bundle is reproducible at any time; nothing user-visible is lost by
not persisting it. S3 lands in Phase 2 with the artifacts that genuinely
can't be re-derived, and export bundles can start persisting then if
there's a reason (e.g. download links in email).
**Alternatives considered:** Standing up S3 now (infra for derivable
files); storing bundles as bytea in Postgres (bloats the DB for no gain).
**Doc:** `02` §4.3 (deviation scoped to Phase 1); `apps/api/src/planning/export.ts`

### ADR-43 — Phase 1 stopgap: per-org rolling-24h LLM spend ceiling
**Status:** 🔧 Designed by Claude from a Phase 1 security-review finding
**Context:** ADR-31's combined LLM+sandbox budget circuit breaker lands in
Phase 2, but Phase 1 already ships paid endpoints: a signed-in org member
can fire edit prompts back-to-back (120 req/min rate limit), each costing
a reasoning-tier completion — denial-of-wallet with no ceiling. Rate
limiting bounds request rate, not money.
**Decision:** Before any agent task starts (and before session creation),
the API checks `SUM(cost)` from `cost_events` for the org over a rolling
24 hours against `ORG_DAILY_LLM_BUDGET_USD` (env, default $10). Exhausted
→ 429 with a plain message; nothing is queued. This is deliberately
coarse — no reservations, no per-user split, checked at task start rather
than per LLM call — because it exists to cap the blast radius of abuse or
a runaway loop, not to be the real budget product. ADR-31 replaces it in
Phase 2 with the combined per-run/per-org circuit breaker; this check
should fold into that mechanism, not survive beside it.
**Alternatives considered:** Tighter per-route rate limits (still
unbounded over time); doing nothing until Phase 2 (leaves Fork A's
standalone release uncapped).
**Doc:** `apps/api/src/planning/flows.ts` (isOrgBudgetExhausted),
`packages/config/src/env.ts`

### ADR-44 — Provider-agnostic Sandbox port; hardened local Docker is M1's real sandbox
**Status:** 🔧 Designed by Claude during Phase 2 M1 (no E2B key exists in the dev environment)
**Context:** 02 §6 picks E2B as the v1 sandbox, but no E2B API key exists
yet and M2/M3/M4 all bind to whatever execution interface M1 draws. A
pure in-memory mock would make M1 a tautology — it would prove the loop
can call a function that lies, not that generated code runs.
**Decision:** A narrow provider-agnostic `Sandbox` port in
`packages/sandbox` (`writeFile/readFile/runCommand → {stdout, stderr,
exitCode, durationMs}/dispose`), with two adapters: `LocalDockerSandbox`
(the real M1 substrate — hardened container: no network, read-only rootfs,
tmpfs /tmp noexec + /workspace exec, cap-drop ALL, no-new-privileges,
pids/memory/cpu limits, non-root, auto-remove, run-id labels) and
`E2bSandbox` (compiles against the real `e2b` SDK types; runs the moment a
key exists). `SANDBOX_DRIVER=local|e2b` selects at boot; e2b without a key
fails startup, never mid-run. Port semantics: a command that ran returns
its real exit code — non-zero is signal, never a throw; throws are
reserved for the sandbox itself failing (timeout/died/protocol). No
driver concept may leak into the port.
**Alternatives considered:** Mock-only sandbox (retires nothing);
E2B-first with no local driver (unbuildable without creds); child-process
runner (no isolation boundary at all).
**Doc:** `packages/sandbox/src/port.ts`, `src/local/docker-sandbox.ts`,
`src/e2b/e2b-sandbox.ts`, `src/select.ts`

### ADR-45 — Coder speaks native OpenAI-compatible function-calling; new tool-loop runner beside AgentSpec
**Status:** 🔧 Designed by Claude during Phase 2 M1
**Context:** The OpenRouter client was one-shot text only; the Coder needs
a request→tool-call→execute→feed-result loop. Phase 1's `AgentSpec`
(pure buildMessages/parse, single call) cannot express an agentic loop
without contortion.
**Decision:** `completeChatWithTools` as a sibling method on
`OpenRouterClient` using the native OpenAI-compatible wire shape
(`tools`/`tool_choice` in the request, `tool_calls` + nullable content in
the response) — no home-grown ReAct text convention, so swapping the
mocked LLM for live creds changes nothing. Non-streaming for M1 (no UI to
stream to; avoids reassembling fragmented tool_call deltas). The loop
itself is a second agent-execution shape, `buildTask(input, deps) →
TaskResult`, living beside `runAgent` — the Coder is deliberately NOT
forced into `AgentSpec`. Four tools only: writeFile/readFile/runCommand/
submit, args zod-validated with hard caps. ZDR/cost/timeout semantics
identical to completeChat (ADR-24/26/27 untouched).
**Alternatives considered:** Text-protocol ReAct (diverges from the real
wire shape, wasted work at cred-swap time); forcing Coder into AgentSpec
(wrong contract); streaming tool calls (complexity with no consumer).
**Doc:** `packages/llm/src/tools.ts`, `packages/agents/src/coder/`

### ADR-46 — M1 crash semantics: durable per-turn transcript, startup reaper, runner-owned verification, no mid-loop resume
**Status:** 🔧 Designed by Claude during Phase 2 M1
**Context:** M1 has no Temporal (that is M3's whole point), so a crashed
loop process cannot resume mid-task. Pretending otherwise would duplicate
M3 badly; ignoring it wedges ADR-29's one-active-run index forever.
**Decision:** Three honest guarantees instead of fake durability: (1)
every message persists to `messages` (envelope + bigserial seq) as it
happens, so a crash leaves a complete transcript up to the last committed
turn; (2) the harness runs a startup reaper — any non-terminal run is
marked failed and its labeled containers force-removed — so a crash never
blocks the next run; (3) verified-green comes ONLY from the runner
executing the task's `verifyCommand` in the sandbox and observing exit 0;
the model requests verification via a no-argument `submit` tool and can
never define or fake success (this is also the prompt-injection backstop:
adversarial tool output can steer prose, not the exit code). Re-running a
task starts fresh. Per-task caps (turns/wall-clock/cost) are the only
circuit breaker in M1 — the org-level combined breaker is ADR-31 (M2+).
**Alternatives considered:** Checkpoint/resume in M1 (re-implements
Temporal, wrong layer); model-supplied verify command (self-grading —
`echo pass` passes); no reaper (second run 409s forever after any crash).
**Known limit (M1, closed in M2):** the runner owns the verify *command
string*, but it runs in `/workspace`, which the Coder fully writes — so the
model can satisfy verification by editing the fixtures it grades (overwrite
the test file, add a `test: exit 0` script). M1 "verified" therefore means
"the model made the operator's command exit 0 in a tree it controls" — real
pipeline proof, NOT independent acceptance. M2's Tester owns test fixtures
on a path the Coder cannot write (or verifies in a fresh container with only
runner-supplied tests); M1 does not claim that guarantee.
**Doc:** `packages/agents/src/coder/build-task.ts`, `persist.ts`,
`apps/api/src/dev/build-task-cli.ts`

### ADR-47 — Hermetic sandbox network policy for M1: --network none, toolchain baked into the image
**Status:** 🔧 Designed by Claude during Phase 2 M1 (owner directive: maximize reliability under no-creds dev)
**Context:** Generated code fetching arbitrary hosts is both the top
isolation risk (02 §6, Phase 3 verifies egress restrictions) and the top
flakiness source (npm installs in a sandbox with no registry mirror).
Dependency provisioning policy defines what tasks M1 can even run.
**Decision:** The local sandbox always runs with `NetworkMode: none`;
whatever toolchain a task needs must be baked into `SANDBOX_IMAGE`
(default `node:22-bookworm-slim`). M1 tasks are therefore
stdlib-only-node scoped — dependency installation (registry mirror,
allowlisted egress, or pre-warmed images) is an explicit M2+ decision,
not a relaxation to make quietly. The egress block is asserted by an
integration test (a fetch from inside the sandbox must fail), which is a
down-payment on Phase 3's real egress verification, not a substitute.
**Alternatives considered:** Allow network during an install phase
(broader tasks, weaker isolation, flaky without creds/mirrors);
E2B-style default-on internet (contradicts the ZDR-grade caution this
project applies to user-derived content).
**Doc:** `packages/sandbox/src/local/docker-sandbox.ts`,
`packages/config/src/env.ts` (SANDBOX_IMAGE)

### ADR-48 — M2 Tester: deterministic verification in a fresh sandbox against runner-owned tests
**Status:** 🔧 Designed by Claude during Phase 2 M2
**Context:** M1's `submit` ran a runner-owned command, but IN the Coder's own
`/workspace` (ADR-46 known-limit): the Coder can overwrite the test file or
add a `test: exit 0` script and self-grade. `--network none` + ro-rootfs did
not help — `runCommand` is arbitrary shell, so in-container path isolation is
defeatable. Spec §5.1 wants a Tester agent, fast-tier, "run suite, parse
structured output."
**Decision:** Two pieces. (1) Verification runs in a FRESH sandbox per check,
not the build sandbox: the runner copies the Coder's produced sources in,
then writes the runner-owned test files LAST (so they overwrite any file the
Coder named the same), runs the test command, and the EXIT CODE is the
authoritative pass/fail. (2) The Tester agent (`testerAgent`, role "tester",
fast tier) is a one-shot `AgentSpec` that ONLY parses raw test output into
structured failures for the Coder's next fix turn; it does not and cannot
decide pass/fail, and a parse/LLM failure degrades to an empty report rather
than discarding the exit-code verdict. Verification is injected into
`buildTask` as a `Verifier` dep (`makeTesterVerifier`); M1's inline verifier
stays the default. The Coder↔Tester fix loop is a plain bounded loop inside
buildTask (`maxTestFixCycles`, default 4) — NO Temporal, NO escalation gate
(those are M3/M4); exhaustion → `TaskResult failed{reason:"test_failed"}`.
**What this guarantees — and what it does NOT (scoped precisely after
review):** the guarantee is FILE-LEVEL — the Coder cannot *edit or replace*
the tests that grade it, because they are written by the runner into a
sandbox the Coder never touches. This is a real improvement over M1's
self-grading and is what the integration test proves. It is NOT full
tamper-proof grading: the runner test still `require`s the Coder's source
into the SAME process that runs the assertions, so adversarial Coder code
could subvert its own in-process test run (monkeypatch `node:assert`, call
`process.exit(0)` before assertions). Defeating that needs OUT-OF-PROCESS /
black-box grading (spawn the artifact as a child and assert on observable
output/exit from a runner-owned parent, or parse a trusted machine-readable
report on the host) — deferred; capture as its own ADR when built (M4/
hardening era). The current Coder is an LLM building software, not a
dedicated adversary, so file-level tamper-proofing is the proportionate M2
guarantee; the residual is documented, not silently claimed away.
**Alternatives considered:** LLM Tester that authors+runs its own tests
(still tamperable, adds cost/nondeterminism to the grade); in-container path
isolation (defeated by runCommand); a full state machine (that is M3).
**Known limits:** (a) the in-process grading residual above; (b) only files
the Coder wrote via `writeFile` are copied into the fresh sandbox — the Coder
must `writeFile` every graded artifact (files it produces via `runCommand`
are not snapshotted; a whole-`/workspace` snapshot needs a port `listFiles`
capability, deferred); (c) runner-owned tests are supplied to the verifier
(harness/Build Spec) — turning prose `acceptance_criteria` into real tests
(test authoring) is later work; (d) the inline default verifier's repeated
failure is now bounded by `maxTestFixCycles` (→ `test_failed`) rather than
looping to `turn_cap` as in strict M1 — a deliberate improvement, not exact
M1 parity.
**Doc:** `packages/agents/src/tester/{tester,verify}.ts`,
`packages/agents/src/coder/{build-task,verify}.ts`

### ADR-49 — ADR-31 combined budget circuit breaker supersedes ADR-43's stopgap
**Status:** 🔧 Designed by Claude during Phase 2 M2
**Context:** ADR-43 was a per-org LLM-only rolling-24h ceiling checked before
planning tasks. Now that sandbox cost exists (M1) the real ADR-31 combined
(LLM + sandbox) breaker is due, per-run AND per-org (02 §9, ADR-36).
**Decision:** One `checkBudget(db, {organizationId, runId?, liveAccruedUsd,
config})` in `packages/agents/src/budget.ts` backs both surfaces — planning's
`isOrgBudgetExhausted` now delegates to its per-org half, so there is ONE
breaker, not two. Per-run = `SUM(cost_events WHERE run_id)` PLUS the in-flight
task's live-accrued sandbox cost; per-org = `SUM WHERE org` over a rolling
window. Sandbox cost is persisted best-effort, so counting only committed rows
under-counts; adding the live accrual makes the check err toward over-counting
— the safe direction for a ceiling (security-review point). Checked before
every LLM call and before each verification (which creates a sandbox); a trip
mid-task → `TaskResult failed{reason:"budget_exceeded"}`. Config:
`RUN_BUDGET_USD` (new) + `ORG_DAILY_LLM_BUDGET_USD` (existing, now the org
window value). Query logic only — no schema change.
**Alternatives considered:** Keep ADR-43 beside ADR-31 (two drifting
breakers); trust persisted cost_events alone (under-counts best-effort
sandbox cost); a reservation/ledger system (over-built for v1).
**Doc:** `packages/agents/src/budget.ts`, `apps/api/src/planning/flows.ts`,
`packages/config/src/env.ts`

### ADR-50 — Temporal workflow/activity split for the build orchestrator
**Status:** 🔧 Designed by Claude during Phase 2 M3
**Context:** M1/M2 proved a single task through `buildTask`; M3 must dispatch
a whole task_graph in dependency order with a durable state machine that
survives a worker restart (02 §3, §14). No Temporal Cloud creds exist.
**Decision:** One Temporal WORKFLOW per run (`buildRunWorkflow`,
`packages/orchestrator/src/workflows.ts`) owns the state machine, the pure
topological ordering (`topoSort`), and the per-task retry budget — and does
ZERO IO. Every side effect is an ACTIVITY (`loadTaskGraph`, `ensureTaskRow`,
`setRunStatus`, `runTask`, `publishEscalation`). `buildTask` (Postgres +
Docker + LLM, uses Date.now) MUST be an activity — this is a hard Temporal
determinism constraint, not a choice: workflow code runs in a V8 isolate
with Date.now/Math.random/fs/http stubbed, so IO there corrupts replay.
`runTaskActivity` is a thin wrapper (create sandbox → buildTask → dispose);
buildTask/verifier/Sandbox port are UNCHANGED. Dispatch is SEQUENTIAL in
topological order for M3 (parallel-where-deps-allow deferred — it adds
sandbox-concurrency policy and partial-failure semantics). The workflow
module imports ONLY @temporalio/workflow + pure ./policy + ./types (never
@mullion/{agents,db,sandbox,llm}); the package boundary makes the #1
Temporal footgun a structural rule. No Cloud: local `temporal server
start-dev` for dev, @temporalio/testing for tests. State machine M3 drives:
`queued → building → done | failed` only — `testing`/`fixing` happen INSIDE
buildTask (ADR-48) and aren't run-level phases; `reviewing`/`shipping` are
M4. The 02 §3 linear diagram no longer maps 1:1 to run-level phases.
**Alternatives considered:** buildTask as workflow code (breaks determinism);
one workflow per task (loses the graph-level state machine); self-hosted
Temporal cluster (ops burden before usage, ADR-10).
**Doc:** `packages/orchestrator/src/{workflows,activities,worker,client,
policy,types}.ts`

### ADR-51 — Two-layer retry: Temporal RetryPolicy (infra) vs workflow budget (logical)
**Status:** 🔧 Designed by Claude during Phase 2 M3
**Context:** 02 §3.1 wants a per-phase retry budget (default 3) before
escalation. Temporal also has its own activity RetryPolicy. These must not
collide or double-count.
**Decision:** They don't overlap BECAUSE `buildTask` never throws — it
funnels every logical failure into a returned `TaskResult{failed, reason}`
(ADR-46). So: (a) Temporal's `runTaskActivity` RetryPolicy
(`maximumAttempts: 3`) fires ONLY on THROWS = infra faults (sandbox create
fail, DB down, worker killed mid-activity); (b) the workflow's per-task
retry budget (`RETRY_BUDGET = 3`) acts on RETURNED `failed{reason}` via a
disposition table: `budget_exceeded` → terminal (retrying spends more
against a hit ceiling; the workflow COMPLETES with a failed result, driving
run.status=failed — it does NOT throw a workflow-level failure, because the
build failed but the workflow succeeded at orchestrating); everything else
(`test_failed`/`turn_cap`/`time_cap`/`sandbox_died`/`llm_error`/`protocol`/
`crashed`) → retry within budget. On budget exhaustion M3 emits an
`escalation_required` stream event and auto-fails. The `escalationSignal`
(`approve`/`abandon`/`{redirect}`) is DEFINED but NOT handled — a paused
workflow with no UI would hang; M4 replaces the auto-fail with the
`setHandler` + `condition()` human gate (ADR-07). This keeps escalation ≠
Phase 2 editing honest: M3 lays the mechanism, M4 the human gate.
**Alternatives considered:** Rely on Temporal RetryPolicy alone (can't
express "retry on a returned value"); full human gate in M3 (hangs without
UI); throw ApplicationFailure on budget_exceeded (leaves run.status unwritten).
**Doc:** `packages/orchestrator/src/{workflows,policy}.ts`

### ADR-52 — Run lifecycle moves to the Temporal workflow; idempotent task creation
**Status:** 🔧 Designed by Claude during Phase 2 M3
**Context:** M1's CLI reaper marks EVERY non-terminal run `failed` at
startup, assuming "non-terminal = crashed." Under Temporal a non-terminal
run in `building` is an IN-FLIGHT workflow Temporal will resume — a blanket
reaper would kill a run about to come back. Also, a Temporal activity
in-flight at a crash is retried, so a blind `INSERT INTO tasks` would
duplicate rows.
**Decision:** (1) The orchestrated path does NOT blanket-reap runs — run
lifecycle is owned by the workflow (only `setRunStatusActivity` or a
completed workflow moves a run terminal). The M1 CLI keeps its own reaper
but scoped/documented as CLI-only (it has no Temporal). (2)
`ensureTaskRowActivity` is idempotent: migration 0005 adds
`UNIQUE (run_id, spec_task_id)` and the activity does INSERT ... ON CONFLICT
DO NOTHING then SELECT, so a retried activity returns the same taskRowId
instead of a duplicate. (3) An in-flight task at crash re-runs from scratch
(ADR-46 "re-running starts fresh"); its orphaned sandbox is reaped per-run
inside `runTaskActivity` (`reapContainersForRun`). Crash-resume itself is
FREE from Temporal event history (a completed activity's result is replayed,
never re-executed) — proven by the integration test (worker1 completes task
A, is replaced by worker2, A's activity fires exactly once). (4) The whole
workflow body is wrapped in a catch: an activity that exhausts its (now
deep, 20-attempt) infra RetryPolicy — or a deterministic failure the
activity raises as `ApplicationFailure.nonRetryable` (spec not found/parse,
task row missing) — moves the run to terminal `failed` (best-effort) and
COMPLETES the workflow, so a fault can NEVER leave the run stuck `building`
holding the slot with no reaper. Without this the reaper-removal above would
be a durability hole. ADR-29's
one-active-run index is unchanged and CORRECT (a resuming run genuinely is
the one active run); only M1's compensating reaper is removed from the
orchestrated path. Schema note: `stream_events.stream_id` is polymorphic
(session id OR run id) → no composite FK (org consistency enforced at the
write/read boundaries).
**Alternatives considered:** Keep the blanket reaper (kills resuming runs);
mid-task checkpointing (re-implements Temporal one layer too deep);
composite FK on stream_events (impossible — polymorphic parent).
**Doc:** `packages/orchestrator/src/activities.ts`,
`packages/db/drizzle/0005_*.sql`, `apps/api/src/dev/build-task-cli.ts`
