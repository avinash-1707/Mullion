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
**Amendment (Phase 3 verification):** the Phase-2 security gate tightened
this beyond the original text — `select.ts` refuses `SANDBOX_DRIVER=e2b`
even with a key until the adapter reaches network/resource-isolation parity
with the hardened local driver. The driver-parameterized egress suite that
parity requires now exists (`packages/sandbox/src/egress.integration.test.ts`,
passing against local Docker); enabling E2B = hardening the adapter + adding
its driver to that suite + removing the `select.ts` guard.

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

### ADR-53 — ArtifactStore: durable produced-repo tree; local-fs substrate, union workspace
**Status:** 🔧 Designed by Claude during Phase 2 M4
**Context:** M1–M3 run each task in a fresh sandbox that is disposed; the
produced files were never persisted and tasks never shared a workspace.
Reviewer (needs the repo) and DevOps (needs to package/push it) both require
a durable cumulative tree — the real M4 spine, missing until now.
**Decision:** An `ArtifactStore` port (`packages/artifacts`) mirroring the
Sandbox dual-adapter shape (ADR-44): `LocalFsArtifactStore`
(ARTIFACT_DIR/<runId>/… — the real M4 substrate, genuine files) + an
`S3ArtifactStore` stub (compiles, unused, no creds) + `InMemoryArtifactStore`
(tests), selected by `ARTIFACT_STORE=local|s3` (s3 without a bucket fails at
boot). After each task, `runTaskActivity` snapshots the sandbox's
writeFile-tracked files (`TaskResult.producedPaths`) into the store BEFORE
dispose — regardless of verified/failed, since a partial task's files still
belong in the delivered repo (ADR-33). Accumulation is UNION-only
(last-writer-wins per path); hydration back into sandboxes (dependent-task
builds) is deferred to a fast-follow (Option A). Only writeFile-tracked files
are captured (ADR-48 known-limit b carries forward — files a task produces via
runCommand are not snapshotted).
**Alternatives considered:** reconstruct the repo from the messages transcript
(lossy — truncation caps + runCommand files missing); DB blobs (rejected for
derivable/large files, consistent with ADR-42); snapshot+hydrate now (real
surgery into M2's verifier — deferred).
**Doc:** `packages/artifacts/`, `packages/agents/src/coder/build-task.ts`
(producedPaths), `packages/orchestrator/src/activities.ts` (snapshot)

### ADR-54 — Full team: advisory Reviewer, deterministic DevOps delivery, non-gated on success
**Status:** 🔧 Designed by Claude during Phase 2 M4
**Context:** M4 adds Reviewer + DevOps and Fork B end-to-end delivery
(02 §5/§11). Delivery must be offered identically for full and
partial/abandoned builds (ADR-33), and packaging must not require live-deploy
creds (ADR-04/15).
**Decision:** (1) Reviewer = a one-shot AgentSpec (`buildReviewerAgent`, role
reviewer, temp 0), a near-clone of the planning consistency reviewer, run in a
`reviewing` phase over the artifact-store tree + task acceptance criteria +
decision log. ADVISORY: the verdict is recorded (decision_log, actor reviewer)
+ streamed (review_result), and a blocker flags the delivery summary, but does
NOT auto-loop a fix cycle (the automated `fixing` loop = §12's infinite-
negotiation risk, deferred). DoD "clears one review round" = one pass runs and
its verdict is durably recorded. (2) DevOps/delivery = a `DeliveryTarget` port
(`packages/delivery`): `ArchiveDeliveryTarget` (jszip, reusing ADR-42's dep,
always available) + `GitHubDeliveryTarget` (Octokit create-repo → blobs → tree
→ commit → ref, scope `repo`) + local fakes. Commit message is static for M4
(DevOps LLM use deferred). (3) ADR-33 non-gated delivery: `orchestrate()`
collects per-task outcomes and runs to a terminal SHIP on every path — full,
partial, or abandoned — with a "what's built / missing" summary; both `done`
and `failed` pass through `shipping`. A task whose dependency didn't complete
is skipped-and-flagged.
**Alternatives considered:** Reviewer reject → auto-fix loop (deferral, §12
risk) or → human gate (couples happy-path to a signal); simple-git push (needs
a git binary + token-in-URL leak — Octokit is cleaner); archiver v8 (uncertain
new API — jszip already a dep).
**Doc:** `packages/agents/src/reviewer/`, `packages/delivery/`,
`packages/orchestrator/src/{workflows,activities}.ts`

### ADR-55 — Escalation gate wired: signal + condition + timeout; redirect is the one build free-text
**Status:** 🔧 Designed by Claude during Phase 2 M4
**Context:** M3 defined `escalationSignal` but left it unhandled (auto-fail).
02 §3.1/ADR-07 want a real human approve/redirect/abandon gate on retry-budget
exhaustion, and ADR-02 forbids free-text edits DURING build — which a redirect
appears to violate.
**Decision:** On budget exhaustion the workflow emits `escalation_required`
and `condition()`-waits (ESCALATION_TIMEOUT 30 min) for the human decision via
`setHandler(escalationSignal)`; a timeout defaults to ABANDON so an unattended
gate can't hang forever holding the ADR-29 slot. `approve` = accept the
current state (task accepted-incomplete, flagged partial); `abandon` = drop
the task, skip its dependents; `redirect` = re-run the task with a new
instruction, resetting the retry budget once, capped at 2 redirects.
POST /api/builds/:id/escalate signals the workflow. RECONCILING ADR-02: a
redirect is the ONE sanctioned free-text-during-build input — but it is a
signal to a PAUSED workflow, scoped to a single stuck task's instruction,
mechanically and visually distinct from a Phase-2 planner edit-prompt (which
re-derives architecture). It does not reopen planning.
**Alternatives considered:** auto-fail (M3 placeholder, no human control);
full gate with no timeout (hangs, wedges ADR-29); unbounded redirects
(infinite loop).
**Doc:** `packages/orchestrator/src/workflows.ts`, `apps/api/src/routes/builds.ts`

### ADR-56 — GitHub is a link-only delivery connection, hard-decoupled from sign-in
**Status:** 🔧 Designed by Claude during Phase 2 M4
**Context:** ADR-23 wants GitHub `linkSocial` with `repo` scope for delivery;
ADR-35 requires email/password sign-in and no anonymous/social login. Better
Auth's `socialProviders.github` is shared by both link AND the /sign-in/social
+ /callback/github routes, so "decoupled from sign-in" was only a UI
convention, not a guarantee.
**Decision:** GitHub is configured only when a soft-optional OAuth app is
present (`GITHUB_CLIENT_ID/SECRET` — absence is fine, GitHub push is an
optional target), and a Better Auth `hooks.before` HARD-BLOCKS
`provider: "github"` on /sign-in/social and /callback/github, so it can only
be linked from an authenticated session via /link-social. The `repo`-scoped
token lives per-user in Better Auth's `account` row (ADR-36), read only at
delivery time (`getGitHubAccessToken`). GitHub OAuth Apps issue no refresh
token and don't expire, so no refresh flow. `GET /api/github/connection`
reports link status. Delivery selects `GITHUB_DELIVERY=fake|github` (fake =
local "remote", no creds — the M4 substrate).
**Alternatives considered:** UI-only decoupling (not a real guarantee — a raw
POST /sign-in/social would still sign in via GitHub); make GitHub a boot-hard
requirement (wrong — it's optional).
**Doc:** `apps/api/src/auth.ts`, `apps/api/src/github/token.ts`,
`apps/api/src/routes/github.ts`

### ADR-57 — No Redis message bus; Temporal dispatch + Postgres tables ARE the bus
**Status:** 🔧 Designed by Claude during Phase 2 M4
**Context:** 02 §3 names Redis Streams as the "message bus" for the build
team. That predates ADR-50 moving dispatch into Temporal activities.
**Decision:** Do NOT build Redis. The v1 realization of the §3 bus is:
Temporal activity dispatch (the orchestrator IS the coordinator — task
routing), the `messages` table (durable structured envelopes per task, already
envelope+seq), and `stream_events`/SSE (the client feed, incl. M4's
`review_result`/`delivery_result` events). Redis Streams would add an
operational dependency with zero consumer. ADR-38 already anticipated the
revisit; the conclusion is that it is not needed for v1. Revisit only if a
genuine cross-service pub/sub need emerges (e.g. multiple worker fleets that
must coordinate outside Temporal).
**Alternatives considered:** Build Redis Streams now (operational burden, no
consumer); a DB-polling pseudo-bus separate from Temporal (duplicates what the
orchestrator already does).
**Doc:** `packages/orchestrator/` (Temporal dispatch), `packages/db`
(messages/stream_events)

### ADR-58 — Record/replay cache lives at the client's fetch boundary; replay misses hard-fail
**Status:** 🔧 Designed by Claude during Phase 3
**Context:** ADR-11 specified a record/replay cache; the implementation had
open judgment calls — where it hooks in, what a miss does, what gets stored.
**Decision:** The cache is a fetch-wrapper injected into `OpenRouterClient`
(`fetchImpl`), not a proxy server: routing, ZDR enforcement, response
parsing, and ADR-28 cost capture all execute unchanged under replay — only
the network hop is substituted. One JSON cassette per request, keyed by
sha256 of the request body (so model slug, messages, tools, and sampling
params all participate). Cassettes store the served model/provider/
generation-id from response metadata alongside the pinned slug (02 §10.1's
routing-change vs provider-drift distinction) and never store request
headers — the bearer token cannot leak into a cassette. Modes are explicit
env config (`LLM_REPLAY_MODE=off|record|replay` + `LLM_CASSETTE_DIR`):
a replay miss throws a typed `LlmReplayMissError` rather than falling back
to a live call (determinism over convenience); failure responses (4xx/5xx)
are never recorded; production boot rejects any mode but `off`. Record mode
drains streams before returning — capture fidelity over live deltas,
acceptable for a fixture-capture tool.
**Alternatives considered:** A standalone loopback mock server via
`OPENROUTER_BASE_URL` (already exists for hand-written fixtures, but can't
record and duplicates parsing); replay-with-live-fallback on miss (silently
reintroduces cost + nondeterminism); recording error responses (replaying a
transient 429 forever is a trap, not a fixture).
**Doc:** `packages/llm/src/replay.ts`, `02` §10.1, ADR-11

### ADR-59 — OTel tracing: no-op-by-default bootstrap, OTel 1.x line, span placement
**Status:** 🔧 Designed by Claude during Phase 3
**Context:** 02 §9 requires one trace from idea through delivery across both
services. Implementation had judgment calls: SDK version line, how tracing
turns on, and where spans are created.
**Decision:** A `packages/otel` package owns the bootstrap: tracing is a
hard no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set (`OTEL_SDK_DISABLED`
as override), so dev/test/CI pay nothing and need no collector — heavy SDK
packages load via dynamic import only when enabled. Pinned to the OTel 1.x
SDK line because `@temporalio/interceptors-opentelemetry` (the only way to
carry context across the workflow sandbox) depends on it; upgrading to
OTel 2.x waits on Temporal. Auto-instrumentation is undici-only
(diagnostics_channel-based, reliable under tsx's ESM loader); the Hono
request span is a hand-rolled middleware (~40 lines) that extracts
W3C traceparent and names spans by route pattern, instead of adding
`@hono/otel`. Trace continuity: client interceptor (API) → workflow
interceptor module (bundled) → activity interceptors (Node) → manual spans
at the two seams that matter — every LLM call (`llm.*` spans carrying role,
served model, generation id, tokens, cost) and every coder tool invocation
(`tool.*` spans carrying path/cmd/exit code). Workflow-sandbox spans exit
via Temporal's exporter sink (separate BatchSpanProcessor, same endpoint).
`stream_events` rows are NOT stamped with trace ids in v1 — events already
key to runs/sessions; revisit only if trace↔UI-event correlation is needed.
**Alternatives considered:** `getNodeAutoInstrumentations()` (unreliable
module patching under tsx ESM, large dep surface); `@hono/otel` (thin value
over http auto-instr for one more dep); OTel 2.x with a type-cast at the
Temporal boundary (1.x-shaped spans mis-serialize in a 2.x exporter);
stamping trace ids into stream_events (schema churn, no consumer yet).
**Doc:** `packages/otel/`, `02` §9

### ADR-60 — Eval suite v1: direct-drive build phase, scripted CI baseline, repo-committed history
**Status:** 🔧 Designed by Claude during Phase 3
**Context:** ADR-12 fixed the metrics (pass rate, retries, escalation
frequency, cost/task per version) over 15–20 fixed tasks "end-to-end
through both services". With no live OpenRouter key yet, a literal
end-to-end live run can't produce numbers, and CI needs something
deterministic to guard the harness itself.
**Decision:** v1 is 16 fixed tasks (difficulty 1–5, incl. one designed
verify→fix cycle and one designed retry-exhaustion/escalation) executed by
a direct-drive harness: the REAL buildTask loop, REAL sandboxes, REAL
retry policy (RETRY_BUDGET/dispositionFor) and REAL persistence
(runs/tasks/messages/cost_events under a dedicated eval org), but no
Temporal in the loop — workflow orchestration is covered by the gated
integration suite, and eval metrics are task-level. Three modes: `scripted`
(fixture transcripts; CI default; outcome≠expected fails the run),
`live` (real client; numbers become model-quality data), `replay` (ADR-11
cassettes). Planning-phase (Fork A) evals are deferred until live creds
exist — the fixtures already carry the `idea` field they'll consume.
History is one JSONL record per full-suite run, committed to
`docs/evals/history.jsonl` by the CI job on main (paths-ignore prevents
retrigger); `trend.md` renders the table. Partial (`--only`) runs never
record. The 16 tasks are FIXED — changing them without superseding ADR-12
corrupts the trend, and a CI test freezes their shape.
**Alternatives considered:** HTTP-driven full-stack eval (API+worker+
Temporal+auth in CI — the honest "both services", deferred to live-creds
time, not discarded); GitHub artifacts for history (no reviewable trend in
the repo, awkward cross-run fetching); scripted mode asserting pass-rate
thresholds instead of exact expectations (thresholds drift silently).
**Doc:** `packages/evals/`, `.github/workflows/evals.yml`, `02` §10.2,
ADR-12

### ADR-61 — Eval history: no CI bot commits; job summary + artifact instead
**Status:** 🔧 Owner-directed after Phase 4 close
**Context:** ADR-60 had the evals CI job commit each run's aggregate back
to `docs/evals/history.jsonl` on main ("the trend is a line, not a
point"). In practice every substantive push grew a trailing
`mullion-evals[bot]` commit, which also raced human pushes (the Phase 4
push required a rebase around one). The owner directed: no more bot
commits on main.
**Decision:** The evals workflow no longer commits anything. Each CI run
still executes the full scripted suite against the committed history file,
renders the trend (history + current run), and publishes it two ways: the
workflow job summary (`GITHUB_STEP_SUMMARY`) and the existing per-run
artifact. The job's token drops back to `contents: read`.
`docs/evals/history.jsonl` and `trend.md` stay in the repo, frozen at
their pre-ADR-61 contents; a new record is appended only when a human
deliberately runs the eval CLI locally and commits the result — expected
cadence: at meaningful model/prompt/policy changes, in the same commit as
the change, not per push.
**Alternatives considered:** dedicated `evals-history` branch for bot
commits (keeps an auto-updated line without touching main, but still
grows unattended bot history and adds seed/rebase machinery — rejected as
over-built for a trend the job summary already shows); GitHub artifacts
only (already rejected in ADR-60 — no reviewable in-repo trend at all;
this decision keeps the in-repo file, just human-curated); amending the
triggering commit (force-push, unacceptable).
**Doc:** `.github/workflows/evals.yml`, ADR-60 (amends its history-commit
mechanism; the suite, modes, and metrics are unchanged)

### ADR-62 — apps/api source layout: module-based folders
**Status:** 🔧 Owner-directed after Phase 4 close
**Context:** apps/api grew flat: domain logic (`planning/`, `github/`),
shared infrastructure (`db.ts`, `llm.ts`, `sse.ts`, `temporal.ts`), env,
and a separate `routes/` folder all mixed at `src/` root. Route handlers
lived apart from the domain code they fronted. The owner directed a
module-based layout with dedicated `config` and `lib` folders.
**Decision:** `src/` is organized by role: `config/` (validated env),
`lib/` (shared infrastructure: db, llm, llm-fetch, sse, temporal),
`middleware/` (cross-cutting Hono middleware), and `modules/` (one folder
per feature: `auth`, `planning`, `builds`, `github`, `dev`), with only the
process entrypoints (`index.ts`, `worker.ts`) and the composition root
(`app.ts`) at the top. Each module owns its routes (`routes.ts`) next to
its domain logic and tests. File pointers in earlier ADRs and tracker
entries are historical and intentionally not rewritten.
**Alternatives considered:** keeping the flat layout (cheapest, but
routes-vs-domain split already caused navigation friction); a `core/`
folder holding config+lib+middleware together (one less top-level name,
but hides the config/infra distinction the owner asked for explicitly).
**Doc:** `apps/api/README.md` (layout table), `apps/api/src/`

### ADR-63 — Structured logging: pino in a new `packages/logger`
**Status:** 🔧 Designed by Claude after Phase 4 close
**Context:** No structured logger exists — eight ad-hoc `console.*` call
sites across the API entry point, build worker, Hono error handler, SSE,
and the otel package itself, plus the plain-text `hono/logger`
middleware. Spec `02` §9 requires a `trace_id` threaded through every
agent call across both services; nothing correlates logs with the
existing OTel traces today. Real domain logic lives in `packages/*`
(agents, llm, sandbox, orchestrator, delivery), so an api-local logger
cannot cover the interesting events.
**Decision:** New `packages/logger` wrapping pino, depending only on
`@opentelemetry/api` (never `@mullion/otel`), so `@mullion/otel` can
itself depend on the logger with no cycle. A pino `mixin()` reads the
active span per line and stamps `trace_id`/`span_id`. Entry points
(`index.ts`, `worker.ts`) call `initLogger()` before `startOtel()` and
own transport and level via new validated env (`LOG_LEVEL`,
`LOG_FORMAT` json|pretty, defaulted from `NODE_ENV`) in
`packages/config`; `pino-pretty` is a devDependency wired only in
pretty mode, prod writes raw JSON to stdout. Library packages consume a
hybrid model: module-level `childLogger({ module })` singleton imports
for ad-hoc logs, run-scoped bindings (`org_id`, `build_id`, `run_id`,
`task_id`) injected through the existing activity-deps objects. To make
`trace_id` appear in local dev, `@mullion/otel` always registers a
ContextManager plus bare tracer provider even when
`OTEL_EXPORTER_OTLP_ENDPOINT` is unset (exporterless — the no-op stays
only for the export layer). Day-one `redact` paths cover authorization
and cookie headers, tokens, API keys, passwords, and prompt/completion
bodies; LLM prompt/completion bodies are never logged at all (metadata
only: model, role, token counts, latency) — stdout sits outside the ZDR
guarantee (ADR-27), so redaction is backstop, not policy. `hono/logger`
is replaced by a small pino middleware placed after `tracingMiddleware`
so request-completion lines carry the trace id. Temporal workflow code
(`workflows.ts`, zero-IO isolate) never imports the logger; all logging
happens in activities and normal Node code. Explicitly out of scope:
OTLP logs export, audit-log product feature (Postgres, later), cost
metering, browser/web logging, log shipping infra.
**Alternatives considered:** folding pino into `packages/otel`
(couples concerns and breaks that package's dynamic-import discipline);
app-local logger in `apps/api` (packages can't log); full DI of the
logger through every signature (max testability, too noisy); truncated
prompt/completion logging (still leaks user content, weakens the ZDR
story); OTel logs-bridge/OTLP logs pipeline (deferred until there is
real traffic to ship).
**Doc:** `packages/logger/`, `packages/otel/src/start.ts`,
`packages/config/src/env.ts`

### ADR-64 — Two-frontend topology: dashboard split to its own app on an app. subdomain
**Status:** 🔧 Owner-directed after Phase 4 close
**Context:** apps/web carried two diverging surfaces in one Next.js app:
the public, SEO-first marketing site (cream/serif editorial, Lenis motion)
and the private, dark product dashboard. The upcoming product restyle
would have the two design languages fighting inside one globals.css, one
layout tree and one deploy. The owner directed a split with the dashboard
served from an app. subdomain, working identically on localhost.
**Decision:** Two Next.js apps, one API. `apps/web` keeps marketing plus
the auth pages (root domain, :3000 dev); new `apps/dashboard` owns the
signed-in product at its root (`/` = dashboard, `/sessions/[id]`,
`/builds`, `/builds/[id]`; app. subdomain in prod, :3001 dev). Auth stays
centralized on the Hono API: the Better Auth session cookie lives on
API_ORIGIN only, host-only, SameSite=Lax — `crossSubDomainCookies` stays
OFF because neither frontend reads the cookie, the browser just sends it
back to the API on credentialed cross-origin calls. This requires all
three surfaces to share one registrable domain (eTLD+1) in production —
e.g. mullion.com / app.mullion.com / api.mullion.com — otherwise the
cookie becomes third-party and dies; deploying the dashboard on a foreign
domain (e.g. *.vercel.app) is a topology break, not a config tweak. The
API's three origin allowlists (CORS, CSRF provenance gate, Better Auth
trustedOrigins) all accept the set {WEB_ORIGIN, DASHBOARD_ORIGIN}; the
new DASHBOARD_ORIGIN env var is validated (https-only in prod) alongside
its siblings. Redirect flow: an unauthenticated dashboard visit sends the
browser to `${NEXT_PUBLIC_WEB_URL}/sign-in?returnTo=<deep link>`;
sign-in/up success (and an already-authed visit to the auth pages) hands
off to `resolveReturnTo()` — returnTo is honored only if it resolves to
the dashboard origin exactly (open-redirect guard, unit-tested);
sign-out lands on the marketing root. All cross-app URLs come from env
(`NEXT_PUBLIC_DASHBOARD_URL` on web, `NEXT_PUBLIC_WEB_URL` on dashboard)
— zero hardcoded domains, so the three-port localhost setup and the
subdomain prod setup are the same code. Shared client glue (auth-client,
api fetch wrapper, ui primitives, query provider, CSP proxy, globals.css)
is COPIED into the dashboard, not extracted into a package — the restyle
follow-up deliberately diverges the two aesthetics, and factoring a
design system before that lands would fight it. apps/web keeps temporary
env-driven redirects from the old /dashboard, /builds/*, /sessions/*
paths to the dashboard app.
**Alternatives considered:** `crossSubDomainCookies` with
`Domain=.mullion.com` plus SSR/middleware gating (zero-flash redirects,
but broadens the cookie's blast radius across all subdomains, adds
dev-vs-prod cookie-domain divergence, and is unnecessary while the cookie
never leaves the API origin — deferred, `03` territory); embedding Better
Auth into each Next app (breaks the one-auth-server model that makes N
frontends trivial); a shared `@mullion/ui` package now (premature — see
restyle note); keeping one app with middleware-based host routing (one
deploy serving two hosts, but none of the isolation the split is for).
**Doc:** `apps/dashboard/`, `apps/web/src/lib/return-to.ts`,
`apps/api/src/app.ts` (browserOrigins), `apps/api/src/modules/auth/auth.ts`,
`packages/config/src/env.ts` (DASHBOARD_ORIGIN)

### ADR-65 — Login providers: Google + a second, minimal-scope GitHub OAuth app
**Status:** 🔧 Owner-directed during Phase 5
**Context:** ADR-56 made GitHub link-only because the delivery OAuth app
requests `repo` scope — as a login it would demand full repo access at
sign-in. The owner wants GitHub and Google as real sign-in methods next to
credentials, without touching the delivery model.
**Decision:** Google becomes a first-class social login
(`socialProviders.google`, soft-optional env pair). GitHub login runs on a
SECOND OAuth app with `read:user` + `user:email` only, registered through
the `genericOAuth` plugin as `providerId: "github-login"` (Better Auth
allows one config per built-in provider id, and the built-in `github` slot
stays with the repo-scoped delivery app). Its `getUserInfo` reads
`/user/emails` so `emailVerified` is GitHub's own verdict, which account
linking depends on. The ADR-56 sign-in block on the delivery app stays;
this supersedes only its "GitHub is never a sign-in method" consequence.
**Alternatives considered:** enabling sign-in on the repo-scoped app
(every login grants repo access — rejected); keeping GitHub link-only with
Google as the sole social login (fewer moving parts, but the owner
explicitly wants GitHub login); swapping the apps so login owns the
built-in slot (would migrate existing delivery-linked account rows for no
benefit).
**Doc:** `apps/api/src/modules/auth/auth.ts` (genericOAuth block),
`packages/config/src/env.ts` (GITHUB_LOGIN_*, GOOGLE_*), ADR-56

### ADR-66 — Credential auth: OTP verification/reset, password-presence gate, implicit linking, `image` as avatar
**Status:** 🔧 Designed by Claude during Phase 5, owner-refined
**Context:** Credential accounts had no email verification, no password
recovery, and no linking policy; the owner asked for OTP-based
verification, forgot/reset flows, account linking, and an avatarUrl field.
**Decision:** The `emailOTP` plugin is the single code mechanism (6
digits, 5 min, 3 attempts, `storeOTP: "hashed"`,
`overrideDefaultEmailVerification: true` — no link-based flows exist).
`requireEmailVerification: true` gates credential sign-in;
`autoSignInAfterVerification: true` signs the user in off the verify
response; a data-only migration (0007) grandfathers pre-launch users.
Password reset is the plugin's `request-password-reset` →
`reset-password` OTP flow. Passwordless OTP SIGN-IN is allowed only for
accounts with no credential password (social-first accounts) — the empty
password field is the flag; accounts with a password get 403 on both the
send and sign-in OTP routes (`otp-signin-guard.ts`), and a session-gated
`POST /api/account/set-password` lets social-first users add a password
(never rotate an existing one — that stays change-password's job, which
demands the current password). Account linking: implicit same-email
linking stays ON with `trustedProviders: []` (nothing bypasses the
provider-verified-email check) and `allowDifferentEmails: true` (the
ADR-56 delivery link needs it); the pre-hijack path dead-ends because an
unverified credential row can never be signed into. Avatar reuses the
core `image` column (no `avatarUrl` migration) via Better Auth's
`update-user`, pinned to https URLs ≤ 2048 chars by a
`user.update.before` hook. OTP endpoints ride the credential rate-limit
window on top of the plugin's per-email limit.
**Alternatives considered:** link-based verification/reset emails (two
mechanisms, and the owner asked for OTP); blocking passwordless sign-in
outright (loses the social-first recovery path the owner wants);
`disableImplicitLinking: true` (max caution, but friction for no closed
vector given verification gating); a real `avatarUrl` column (migration +
field-mapping for a cosmetic rename).
**Doc:** `apps/api/src/modules/auth/auth.ts`,
`apps/api/src/modules/auth/otp-signin-guard.ts`,
`apps/api/src/modules/auth/routes.ts`,
`packages/db/drizzle/0007_backfill-email-verified.sql`

### ADR-67 — Email delivery: driver seam, console in dev, Resend pinned in production
**Status:** 🔧 Designed by Claude during Phase 5
**Context:** OTP flows (ADR-66) need real email in production and zero
external dependencies in local dev/test — the same tension
SANDBOX_DRIVER/ARTIFACT_STORE already resolve with env-selected drivers.
**Decision:** One `sendEmail` seam (`modules/email/send.ts`) behind
`EMAIL_DRIVER`: `console` logs the full message (OTP readable off the
terminal — also how the integration harness reads codes back) and is the
dev/test default; `resend` really sends and requires `RESEND_API_KEY` +
`EMAIL_FROM` (verified domain). Production boots ONLY with
`EMAIL_DRIVER=resend` — a console driver in prod would write OTPs into
logs, so the env schema fails the boot, same tier as the https/sslmode
guards. Resend API errors come back in the return value, not as throws —
the driver rethrows so Better Auth never mistakes a failed send for
success. Templates are plain text/HTML (`templates.ts`); branding/i18n
deferred (`03` territory).
**Alternatives considered:** SMTP/nodemailer (another server to run,
Resend is already the chosen stack); logging OTPs at debug level in prod
as a fallback (a leak, not a fallback); sending via a queue/Temporal
(nothing needs durability for a 5-minute code in v1).
**Doc:** `apps/api/src/modules/email/send.ts`,
`apps/api/src/modules/email/templates.ts`, `packages/config/src/env.ts`
(EMAIL_DRIVER guards), `apps/api/.env.example`

### ADR-68 — Recovery flow: forgot-password is the one door; passwordless OTP sign-in de-advertised
**Status:** 🔧 Designed by Claude during Phase 5, owner-decided
**Context:** ADR-66 kept a standing "Email me a code instead" link on
sign-in so social-first accounts (no credential password) had a login
path. The owner wants OTP positioned strictly as credential
verification/recovery, never as a visible login method. Review against
Better Auth 1.6.23 source established that the assumed dead-end does not
exist: `request-password-reset` sends the forget-password OTP for ANY
existing user (it never checks for a credential row), and
`reset-password` CREATES a credential account when none exists. A
social-first user completing forgot-password therefore ends up with a
password — recovery already works end to end.
**Decision:** Remove the standing link and the sign-in form's code steps;
delete the orphaned send/verify sign-in-OTP client mutations.
Forgot-password becomes the single recovery door for every account type,
riding the stock `request-password-reset` → `reset-password` flow; for a
social-first account this intentionally provisions their first password
(implicit linking keeps the OAuth sign-in working). The forget-password
email copy is neutralized to read correctly for both set and reset, and
teaches social-first users what the code does. The `/sign-in/email-otp`
endpoint and the ADR-66 otp-signin-guard stay live-but-dormant at the API
layer (guard + tests kept) — de-advertised, not removed. Motive is
positioning, not security: existing caps (6/hr per-email send, 10/min/IP
credential window, 3 attempts, 5-min expiry) are unchanged.
**Alternatives considered:** adaptive recovery (custom send-router +
non-consuming verify oracle branching social users straight into a
session — cleaner UX but ~4× effort, new endpoints/attack surface, and it
keeps code-login alive under another name, contradicting the positioning
goal); a no-code "use your Google/GitHub button" email for social-first
accounts (strands the lost-provider cohort); deleting the passwordless
endpoint outright (loses a working guarded path for no gain).
**Supersedes:** the ADR-66 clause keeping passwordless OTP sign-in as a
user-visible path (its server-side guard is unchanged).
**Doc:** `apps/web/src/components/auth/sign-in-form.tsx`,
`apps/web/src/hooks/use-auth-mutations.ts`,
`apps/api/src/modules/email/templates.ts`,
`apps/api/src/app.integration.test.ts`

### ADR-69 — Global Request.clone guard at the API composition root
**Status:** 🔧 Designed by Claude during Phase 5
**Context:** better-auth evaluates `ctx.request?.clone()` on every
credential flow (sign-up, unverified sign-in re-send, change-email) to
pass the request as an optional context arg to sendVerificationEmail.
better-call has already cloned the incoming request once to parse the
JSON body, so this is a second clone of an already-teed stream; undici
throws `TypeError: unusable` when the stream reads as disturbed/locked,
a GC/event-loop-timing-dependent state. Result: nondeterministic 500s on
sign-up (~1 in 3 integration runs under load, and the same latent race
in production). A test-side retry was tried and beaten (the flake fired
twice consecutively).
**Decision:** Patch `Request.prototype.clone` once at the API composition
root (`lib/undici-clone-guard.ts`, first import in `app.ts`): try the
native clone; if and only if it throws the exact `TypeError: unusable`,
return the original request and log a one-time warning. Safe because our
`sendVerificationOTP({ email, otp, type })` never reads the request arg,
and strictly an improvement over the alternative (a hard 500). Any other
error still throws. Active in prod and tests — the race is not
test-only. No retries in the test harness.
**Alternatives considered:** retry in the test helper (masks real 500s,
already double-failed); pnpm patch on better-auth dist files (version-
pinned, must patch three routes, silently drops on bump); vitest forks /
fileParallelism false (race is intra-file, isolation doesn't remove the
trigger, slows the suite); pre-buffering requests in the harness (Hono
still yields stream-backed bodies; unfixable from the caller side).
**Doc:** `apps/api/src/lib/undici-clone-guard.ts`, `apps/api/src/app.ts`,
`apps/api/src/app.integration.test.ts` (retry removed),
`apps/api/node_modules/better-auth/dist/api/routes/sign-up.mjs:245-249`
(root cause)

### ADR-70 — BYOK: per-org OpenRouter key, platform fallback, budget split
**Status:** 🔧 Designed by Claude during Phase 5
**Context:** Users hitting the per-org budget ceiling (ADR-31/49) need a
way to spend their own OpenRouter credit instead of the platform's. A
user-supplied key is a live dependency, not a static credential like the
GitHub token (ADR-56): it can lose credit, hit rate limits, or be revoked
mid-build, and a Temporal build that hard-fails on someone else's key
failure reads as a platform failure.
**Decision:**
- **Scope: one key per org** (`byok_keys`, `unique(organization_id)`), set
  by any org member in v1. Keys are a billing concern and budgets are
  per-org (ADR-36); GitHub tokens stay per-user because they are identity.
- **Encryption:** ciphertext via better-auth's `symmetricEncrypt`
  (AES-256-GCM keyed off `BETTER_AUTH_SECRET`) — the same primitive that
  encrypts OAuth tokens (Phase 3 audit M2). Only `key_last4` is ever
  returned to a client; the key never appears in logs (ADR-63).
- **Validation:** `POST /api/settings/byok` probes OpenRouter `GET /key`
  (free, no completion spend) and persists only on success. The endpoint
  rides a strict per-user rate limit (5/min) because each hit is an
  outbound probe.
- **Key selection:** the `OpenRouterClient` takes an injected
  `apiKeyResolver(costContext)` — apps/api wires it to read + decrypt the
  org's enabled key; `packages/llm` stays the only OpenRouter integration
  point (ADR-24) without learning about tenancy tables.
- **Mid-call auth failure (401/403) on a BYOK key:** retry the call once
  on the platform key, record that call `byok=false`, disable the stored
  key (`enabled=false`) so every later call skips straight to platform,
  and surface a warning. Never hard-fail a build on a dead BYOK key; if
  the platform fallback then trips the org budget, the existing
  budget-escalation path pauses the run (ADR-31) — no new run state.
- **Budget split:** the per-org rolling window (`sumForOrgWindow`) counts
  only `byok = false` spend — that ceiling exists to cap the platform's
  bill. The per-run ceiling keeps counting everything — it is runaway-loop
  protection regardless of whose money burns.
**Alternatives considered:** per-user keys (matches GitHub pattern but
mismatches per-org budgets; only the initiator's key would fund a shared
build — revisit in v2); hard-fail on key death (punishes the org for a
stale key mid-build); counting BYOK in the org window (defeats the
pressure-valve purpose); excluding BYOK from the per-run cap (removes the
runaway brake).
**Doc:** `packages/db/src/schema/app.ts` (`byok_keys`, `cost_events.byok`),
`packages/llm/src/client.ts` (`apiKeyResolver`), `packages/agents/src/budget.ts`,
`apps/api/src/modules/settings/`

### ADR-71 — Per-role model overrides: static ZDR allowlist, BYOK-gated
**Status:** 🔧 Designed by Claude during Phase 5
**Context:** BYOK users want to pick which model each agent role uses.
Free-text model choice would let a user pick a model with zero ZDR
providers, silently violating ADR-27; letting platform-funded users route
every role to the priciest model inverts the cost control ADR-25 exists
for.
**Decision:**
- **Allowlist is code:** `packages/llm/src/model-allowlist.ts` exports
  `MODEL_ALLOWLIST: Record<AgentRole, readonly string[]>` + an
  `assertAllowed(role, slug)` guard. Every entry is ZDR-verified by
  inclusion; curation is a human PR (ADR-61 posture), and model slugs stay
  inside `packages/llm` (CODING_STANDARDS §3). Not a DB table — a DB list
  would move slug curation outside code review.
- **Overrides are per-org rows** (`model_overrides`, PK
  `(organization_id, role)`); "Platform default" deletes the row and
  `model_routing` (ADR-25) resolves as before.
- **BYOK-gated:** custom picks save only while the org has an enabled
  BYOK key (server-enforced, mirrored in the UI as disabled options).
  Platform pays → platform picks. If the key is later removed/disabled,
  stored overrides stop applying rather than being deleted.
- **Read-time fail-safe:** `resolveModel` re-checks the stored override
  against the allowlist and the key's enabled state; a stale slug falls
  back to the `model_routing` default — a build never fails on a
  yesterday-valid settings row.
- **Routing cache re-keyed** from `role` to `org:role` — a global cache
  would leak one org's override into another's calls.
**Alternatives considered:** free-text slugs (ZDR footgun); DB-driven
allowlist (curation outside review); per-user overrides (no per-user key
in v1 to gate them on); failing on stale overrides (turns a settings row
into a build-breaker).
**Doc:** `packages/llm/src/model-allowlist.ts`, `packages/llm/src/client.ts`
(`resolveModel`), `packages/db/src/schema/app.ts` (`model_overrides`),
`apps/api/src/modules/settings/routes.ts`
