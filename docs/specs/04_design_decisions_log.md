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
