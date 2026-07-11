# Mullion — Build Plan

## 0. How to use this document

This divides the work into five phases — not the granular week-by-week
milestones (those already exist in `02_system_architecture_spec.md` §14 as
M0–M6, and this plan tells you which milestones sit inside which phase).
The purpose here is different: **each phase below carries an explicit
checklist of which logged decisions (`04_design_decisions_log.md`, ADR-01
onward — the log grows as phases execute) it is responsible for locking
in.** The point is that
nothing gets left to whatever a library, framework, or LLM defaults to —
if a decision exists, it has a named home in exactly one phase below, and
the master table at the end (§6) is the single place to check that every
ADR has one.

A note on numbering: this plan's Phases 0–4 are **build-plan phases** — a
different axis from the product-flow phases 0–4 in
`01_product_ux_flow_spec.md` (intake → clarify → plan → confirm → fork)
and from Doc 2 §14's milestones M0–M6. Below, an unqualified "Phase N"
means a phase of this plan; product-flow phases are written "product
Phase N".

Five phases, deliberately not more: each one represents a genuinely
different *kind* of risk being retired (platform plumbing → the
interactive UX no one's built before → the multi-agent build pipeline →
making it measurable and safe → everything else). Splitting further would
just be re-deriving Doc 2's milestone list at a different altitude; this
stays one level up from that.

One decision governs the shape of this whole plan and is worth stating up
front rather than burying in a phase: **ADR-34** — the interactive planning
experience (Phase 1 below) is built completely, including Fork A shipping
on its own, *before* any automated-build-pipeline work starts (Phase 2).
This de-risks the harder, more novel UX problem first and produces a
usable product slice well before the higher-effort backend needs to exist.

Three more process conventions from `docs/CODING_STANDARDS.md` §11 apply across
every phase rather than belonging to any one of them, so they're stated
once here instead of repeated five times: dependencies always installed
via the package manager's command, never a hand-typed version; external
library usage verified against official docs before writing code against
it, not after review flags it; and a security review at the end of every
phase, findings fixed before the next phase starts — reflected in each
phase's Definition of done above as a recurring line, not a one-time gate
at the end of the project. These are development-process conventions, not
architecture decisions, so they're not logged as ADRs in `04` — see that
document's scope note.

---

## Phase 0 — Foundation & Platform Wiring

**Retires the risk of:** getting the stack plumbing wrong in a way that's
expensive to unwind later (runtime choice, auth, gateway config, LLM
integration point).

**Corresponds to:** the scaffolding half of Doc 2's M0.

### What gets built
- Next.js frontend shell (no real features yet — routing/layout only).
- Hono API as a persistent Node.js service (not edge), with `hono/cors`
  and rate-limit middleware in front of every route, including the SSE
  endpoints.
- Better Auth mounted at `/api/auth/*` with the **organization plugin**
  enabled (ADR-36); at least one working sign-in method end to end; a
  personal organization auto-created at signup. Sign-in required before
  any session can be created (ADR-35) — no anonymous flows.
- Neon provisioned; Drizzle schema for the core tables — `sessions`,
  `build_specs`, `decision_log`, plus placeholders for `runs`/`tasks`/
  `messages` — every tenant-scoped table with a non-null
  `organization_id`, org-scoped data access, and membership-check
  middleware from day one (ADR-36).
- The partial-unique-index concurrency constraints (one active session,
  one active build, per user) created at the schema level from day one —
  not bolted on later.
- OpenRouter wired as the only LLM integration point: a role→model config
  table (placeholder model slugs are fine at this stage), `zdr: true` set
  globally, same-model/different-provider fallback configured, and
  per-request `total_cost`/`usage` captured into a stub budget tracker.
- SSE plumbing built as reusable infrastructure: a generic
  `GET /.../stream` pattern with `Last-Event-ID`-based reconnect and
  Postgres backfill — built once here, consumed by Phase 1 (planning) and
  Phase 2 (build progress) rather than rebuilt per feature.

### Decisions locked in this phase
ADR-16, ADR-17, ADR-18 *(infra only — first real content streamed in
Phase 1)*, ADR-19, ADR-20, ADR-21, ADR-22, ADR-24, ADR-25, ADR-26,
ADR-27, ADR-28 *(LLM cost capture only — combined with sandbox cost in
Phase 2 via ADR-31)*, ADR-29, ADR-32, ADR-08 *(schema only — actively
read/written starting Phase 1)*, ADR-35 *(sign-in wall exists here;
enforced on session creation in Phase 1)*, ADR-36 *(org plugin, schema,
scoping middleware — the tenancy foundation everything else builds on)*.

All formerly ⚠️-flagged defaults (Drizzle, ZDR-only) were explicitly
confirmed on 2026-07-10 — nothing in this phase rests on an unexamined
default.

### Definition of done
- A user can sign up, sign in, and lands in an auto-created personal
  organization; org invitations work end to end.
- Attempting to create a second concurrent session (via direct API call,
  not just the UI) is rejected at the database layer, not just hidden by
  the frontend.
- Two users in different orgs cannot see each other's data — verified via
  direct API calls (org scoping + membership middleware), not just the UI.
- A trivial "hello world" prompt round-trips through OpenRouter using the
  role config and returns cost metadata — with zero hardcoded model
  strings or direct provider SDKs anywhere in the codebase.
- **Security review passed** (auth flow, CORS/rate-limit config, secrets
  handling, env validation) — findings fixed before Phase 1 starts.

---

## Phase 1 — Interactive Planning Experience (Fork A ships alone)

**Retires the risk of:** the hardest, least precedented UX in the product
— live, editable, streamed agent planning — before the build pipeline adds
more complexity on top of an unproven interaction model.

**Corresponds to:** the product half of Doc 2's M0.

### What gets built
- Analyst agent: idea intake, MCQ generation capped at 2 rounds / ~5
  questions per round, Requirements Document output.
- Planner/Architect agent: live diagram + decision log streamed over the
  Phase 0 SSE infrastructure, free-text edit-prompt handling (planning
  only — never once a build is running, ADR-02), dependency-aware
  re-derivation on edits.
- Consistency check gating the "Confirm Architecture" action.
- Simple retry-with-backoff + manual "try again" for Analyst/Planner call
  failures — deliberately not the heavier mechanism Phase 2 uses.
- Build Spec freeze: content-hashed, immutable artifact creation.
- Fork A: renders the frozen Build Spec into a downloadable bundle
  (requirements doc, architecture doc, task graph, decision log) — no
  build compute spent.

### Decisions locked in this phase
ADR-01, ADR-02, ADR-03, ADR-05, ADR-06, ADR-14 *(Analyst + Planner/
Architect half)*, ADR-30, ADR-35 *(enforced here — session creation is
where the sign-in requirement actually bites)*, ADR-36 *(sessions created
inside the user's active org; org members can view, only the creator
edits)*.

### Dependencies
Requires Phase 0's auth, SSE plumbing, decision_log schema, and OpenRouter
routing to already exist.

### Definition of done
- A user can go from typing a one-line idea to holding a downloaded spec
  bundle with **zero build-pipeline code written yet** — this phase is a
  complete, independently shippable product on its own.
- Every node in the live diagram has a corresponding decision log entry —
  no decision appears without a logged rationale.
- Meets Doc 2 §15's planning-stage (product Phase 2) success criteria
  (render latency, full replay from decision log).
- **Security review passed** (session ownership checks on SSE streams,
  spec-export bundle can't leak another user's session data) — findings
  fixed before Phase 2 starts.

---

## Phase 2 — Automated Build Pipeline (Fork B ships end to end)

**Retires the risk of:** the multi-agent execution loop itself — sandboxed
code execution, durable orchestration, and multi-agent coordination, which
is where most of the remaining technical risk in the whole system lives.

**Corresponds to:** Doc 2's M1 through M4, in that internal order —
single-agent proof, then Tester, then the Temporal orchestrator, then the
full team. This plan doesn't re-derive that sequencing; see Doc 2 §14 for
the week-by-week order within this phase.

### What gets built
- E2B sandbox integration, proven first with a single Coder agent before
  any orchestration exists.
- Tester added, wired to real pass/fail feedback.
- Temporal Cloud orchestrator: the `Queued → Building → Testing →
  Reviewing → Fixing → Shipping → Done | Failed` state machine, retry
  budgets, durable crash-resumption.
- Reviewer and DevOps added; structured message envelopes on the bus;
  DevOps scoped to packaging + GitHub push only (no deploy target).
- Escalation gates: approve/redirect/abandon on a stuck task, visually
  distinct in the UI from planning-stage open editing (ADR-07).
- GitHub connection flow (Better Auth `linkSocial`, `repo` scope),
  decoupled from sign-in; delivery as archive + push, offered identically
  whether the build fully succeeded or ended via an abandoned escalation
  gate.
- Budget circuit breaker extended to a single combined LLM + sandbox cost
  figure now that sandbox cost actually exists.

### Decisions locked in this phase
ADR-04, ADR-07, ADR-08 *(now actively read by Coder/Reviewer as design
memory)*, ADR-09, ADR-10, ADR-13, ADR-14 *(Coder/Tester/Reviewer/DevOps
half)*, ADR-15, ADR-23, ADR-31, ADR-33.

### Dependencies
Requires Phase 1's Build Spec format to be stable — this phase consumes
`task_graph` and referenced decision log entries unchanged, it does not
re-plan or re-derive architecture.

### Definition of done
- A confirmed Build Spec reliably produces a repo that builds, passes its
  own tests, and clears at least one review round.
- Killing the orchestrator mid-run and restarting it resumes without
  re-running completed tasks.
- A user reaches delivery (archive + GitHub push) whether the build
  succeeded fully or was partially abandoned at an escalation gate.
- **Security review passed** (sandbox escape/egress attempts, GitHub token
  scope actually limited to `repo`, generated code never executed outside
  the sandbox) — findings fixed before Phase 3 starts.

---

## Phase 3 — Observability, Evaluation & Hardening

**Retires the risk of:** shipping something that *looks* done but where
quality, cost, and Phase 0's config-level choices (ZDR routing, sandbox
isolation) were never actually verified under real conditions.

**Corresponds to:** Doc 2's M6, plus the first (simpler) half of M5.

### What gets built
- OpenTelemetry tracing threaded through both services end to end.
- LLM response record/replay cache operational for fast dev iteration.
- The fixed 15–20 task evaluation suite, wired into CI, tracking pass
  rate / retry count / escalation frequency / cost per task per version.
- A genuine verification pass, not just a configuration check — the
  comprehensive audit that the lighter per-phase reviews in Phases 0–2
  built toward, not a replacement for them:
  - E2B network egress restrictions actually tested against a sandbox
    trying to reach somewhere it shouldn't.
  - ZDR-only routing verified against real OpenRouter provider responses,
    not just assumed from the config flag.
  - Better Auth session/cookie security reviewed.
- Build-phase dashboard, starting as a structured timeline/log view (the
  richer live agent-graph is Phase 4, deliberately not bundled in here).

### Decisions locked in this phase
ADR-11, ADR-12, plus verification (not configuration) of ADR-09 and
ADR-27.

### Definition of done
- The eval suite runs in CI and produces a trend line, not just a
  pass/fail from the latest run.
- A cross-check against `04_design_decisions_log.md` turns up zero ADRs
  that were never actually implemented anywhere.
- ZDR-only routing (ADR-27) verified against real OpenRouter provider
  responses — the config flag demonstrably restricts routing in practice,
  not just in configuration.
- **Security review passed** — this phase's is the comprehensive audit
  across both services, not a lighter per-phase pass; findings fixed
  before Phase 4 starts.

---

## Phase 4 — Polish & Fast-Follow

**Retires the risk of:** nothing architectural — this phase is explicitly
scoped to contain no new decisions, only refinement of what's already
locked in.

**Corresponds to:** the second (richer) half of Doc 2's M5.

### What gets built
- The live, pulsing agent-graph visualization for the *build* phase
  specifically (Phase 1's architecture diagram has been live since Phase
  1 — this is the build-progress equivalent, deliberately sequenced last
  since it's the least load-bearing, most visually-polished piece).
- Any UX refinement backlog items that don't change architecture or
  introduce a new default.

### Decisions locked in this phase
None. If something here seems to need a new decision, it belongs in an
earlier phase (or a new ADR in Doc 4) instead — that's the signal this
phase has scope-crept.

### Definition of done
- Doc 2 §15's full success-criteria list is satisfied end to end.
- v1 is feature-complete against Docs 01–04 with no gap left unaccounted
  for in the master table below.
- **Security review passed** on whatever the polish pass actually touched
  (new visualization surface, any UX changes) — the final gate before
  calling v1 done.

---

## 5. Sequencing at a glance

```
Phase 0 ──▶ Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 4
Platform    Planning    Build       Observ-     Polish
plumbing    UX (Fork A  pipeline    ability &   (no new
            ships       (Fork B     hardening   decisions)
            alone)      ships)
```
Each arrow is a hard dependency, not just a suggestion — Phase 2 consumes
the Build Spec format Phase 1 produces; Phase 3's verification pass needs
Phase 2's sandbox and routing config to already exist; Phase 4 is
intentionally last because it's the only phase that's safe to cut short
under time pressure without losing anything load-bearing.

---

## 6. Master decision-coverage table

Every ADR from `04_design_decisions_log.md`, one row each, so this table
alone answers "did we forget anything":

| ADR | Decision | Phase | Status |
|---|---|---|---|
| 01 | Four-phase interactive planning + fork | 1 | ✅ |
| 02 | Edits only during planning, not build | 1 | ✅ |
| 03 | Diagram + decision log together | 1 | ✅ |
| 04 | Archive + GitHub push delivery, no live hosting | 2 | ✅ |
| 05 | MCQ round/question caps | 1 | ✅ |
| 06 | Consistency check gates confirmation | 1 | ✅ |
| 07 | Escalation gates distinct from editing | 2 | ✅ |
| 08 | Decision log replaces vector DB | 0 (schema) / 2 (active use) | ✅ |
| 09 | E2B managed sandbox | 2 (build) / 3 (verified) | ✅ (port + guarded select; live E2B pass creds-gated) |
| 10 | Temporal Cloud | 2 | ✅ (local dev server + testing harness; Cloud swap creds-gated) |
| 11 | LLM replay cache | 3 | ✅ |
| 12 | Fixed evaluation suite | 3 | ✅ |
| 13 | `Queued→...` state machine rename | 2 | ✅ |
| 14 | Analyst + Planner/Architect roles added | 1 (Analyst/Planner) / 2 (Coder/Tester/Reviewer/DevOps) | ✅ |
| 15 | DevOps scope narrowed | 2 | ✅ |
| 16 | Next.js + Hono | 0 | ✅ |
| 17 | Hono on persistent Node.js | 0 | ✅ |
| 18 | Server-Sent Events | 0 (infra) / 1,2 (usage) | ✅ |
| 19 | SSE reconnect via Last-Event-ID | 0 | ✅ |
| 20 | Neon | 0 | ✅ |
| 21 | Drizzle ORM | 0 | ✅ |
| 22 | Better Auth | 0 | ✅ |
| 23 | GitHub connect separate from sign-in | 0 (scaffold) / 2 (delivery flow) | ✅ |
| 24 | OpenRouter gateway | 0 | ✅ |
| 25 | Role→model config table | 0 | ✅ |
| 26 | Same-model/different-provider fallback | 0 | ✅ |
| 27 | ZDR-only routing | 0 (config) / 3 (verified) | ✅ |
| 28 | Cost metadata from OpenRouter | 0 (LLM only) / 2 (combined, ADR-31) | ✅ |
| 29 | One active session + one active build per user | 0 | ✅ |
| 30 | Phase 2 planning failure handling (retry, not escalation) | 1 | ✅ |
| 31 | Combined LLM + sandbox cost budget | 2 | ✅ |
| 32 | Rate limiting / CORS on Hono | 0 | ✅ |
| 33 | Partial builds get identical delivery options | 2 | ✅ |
| 34 | Planning UX ships before build pipeline | (governs overall sequencing, §0) | ✅ |
| 35 | Sign-in required before starting a session | 0 (auth wall) / 1 (enforced on session creation) | ✅ |
| 36 | Multi-tenant orgs (Better Auth organization plugin, org-scoped data) | 0 (plugin+schema+middleware) / 1,2 (scoped usage) | ✅ |
| 37 | Personal-org provisioning via databaseHooks | 0 | ✅ |
| 38 | Per-stream advisory lock on SSE event publish | 0 | ✅ |
| 39 | decision_log integrity constraints; TEXT-with-enum for evolving sets | 0 | ✅ |
| 40 | Deletion lifecycle: RESTRICT deliberate for v1 | 0 | ✅ |
| 41 | Planner streams JSONL decisions, applied atomically per line | 1 | ✅ |
| 42 | Fork A bundle rendered on demand; S3 for bundles deferred | 1 | ✅ |
| 43 | Stopgap per-org daily LLM spend ceiling (superseded by ADR-31 in Phase 2) | 1 | ✅ |
| 44 | Provider-agnostic Sandbox port; hardened local Docker as M1's real substrate | 2 (M1) | ✅ |
| 45 | Native function-calling wire shape; tool-loop runner beside AgentSpec | 2 (M1) | ✅ |
| 46 | M1 crash semantics: durable transcript, reaper, runner-owned verification | 2 (M1) | ✅ |
| 47 | Hermetic sandbox network (--network none, toolchain baked into image) | 2 (M1) | ✅ |
| 48 | M2 Tester: deterministic verification in a fresh sandbox vs runner-owned tests | 2 (M2) | ✅ |
| 49 | ADR-31 combined budget breaker supersedes ADR-43 stopgap | 2 (M2) | ✅ |
| 50 | Temporal workflow/activity split; buildTask-as-activity; sequential topo | 2 (M3) | ✅ |
| 51 | Two-layer retry: Temporal RetryPolicy (infra) vs workflow budget (logical) | 2 (M3) | ✅ |
| 52 | Run lifecycle → Temporal workflow; idempotent task creation; reaper removed | 2 (M3) | ✅ |
| 53 | ArtifactStore (local-fs substrate, union workspace); snapshot after each task | 2 (M4) | ✅ |
| 54 | Advisory Reviewer + deterministic DevOps delivery; non-gated (ADR-33) | 2 (M4) | ✅ |
| 55 | Escalation gate wired (signal/condition/timeout/redirect reconciles ADR-02) | 2 (M4) | ✅ |
| 56 | GitHub link-only, hard-decoupled from sign-in | 2 (M4) | ✅ |
| 57 | No Redis — Temporal dispatch + Postgres tables ARE the bus | 2 (M4) | ✅ |
| 58 | Record/replay cache at the client's fetch boundary; replay misses hard-fail | 3 | ✅ |
| 59 | OTel: no-op-by-default bootstrap, OTel 1.x line, span placement | 3 | ✅ |
| 60 | Eval suite v1: direct-drive build phase, scripted CI baseline, committed history | 3 | ✅ (history commit amended by ADR-61) |
| 61 | Eval history: no CI bot commits — job summary + artifact; human-curated history file | post-4 (owner-directed) | ✅ |

Process conventions (dependency installation, doc verification, per-phase
security review) apply to every row above but are intentionally not
numbered ADRs — see `docs/CODING_STANDARDS.md` §11 and `04`'s scope note.

If a future decision doesn't fit anywhere in this table, that's the signal
to add a new ADR to `04_design_decisions_log.md` before writing any code
for it — not to let it default silently the way the gap-check round in
this project caught five items (ADR-29 through ADR-33) doing exactly that.
