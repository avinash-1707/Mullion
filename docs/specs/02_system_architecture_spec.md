# Mullion — System & Technical Architecture — Specification (v1)

## 0. Relationship to the original spec

This supersedes the earlier "Autonomous Dev Team Platform" technical spec
(v0). Everything from v0 carries forward except where the body below says
otherwise. Every deviation from v0 — memory layer, sandbox, orchestrator
hosting, agent roster, state-machine naming, dev workflow, delivery, and
each concrete stack choice — is logged as an ADR in
`04_design_decisions_log.md` with its rationale and alternatives; the
resulting current stack is summarized in §13. This document describes only
the current state; consult `04` for how it got that way.

---

## 1. System architecture (updated)

```
Client (Next.js app)
        |
        | HTTPS (REST/RPC) + SSE (server→client event streams)
        |
Hono API (Node.js, persistent process — not edge/Workers)
   ├─ Better Auth, mounted at /api/auth/*  (sign-in + separate GitHub
   │  linkSocial flow for repo-push access, see §8)
   |
   ┌─────────────────────────────┐        ┌───────────────────────────────┐
   │  Planning Session Service    │        │   Build Orchestrator           │
   │  (Phases 0–3, §2)            │──────▶│   (Temporal Cloud, Fork B, §3) │
   │  Analyst + Planner/Architect │ Build  │   Queued→Building→Testing→     │
   │  agents, live SSE stream     │  Spec  │   Reviewing→Fixing→Shipping    │
   └─────────────────────────────┘        └───────────────────────────────┘
        |                                             |
        |                                    Message Bus (Redis Streams)
        |                                             |
        |                                    Agent Workers (Coder / Tester /
        |                                    Reviewer / DevOps — Node.js)
        |                                             |
        ▼                                             ▼
   Neon Postgres, via Drizzle (source of truth:            Sandbox pool (E2B —
   sessions, Build Specs, Decision Log,                    Firecracker-based, managed)
   run/task/message metadata)
        |
   Object storage (S3 — repos, diffs, artifacts, exported spec bundles)
        |
   Observability Plane (OpenTelemetry tracing, cost meter, audit log)
```

Two things worth calling out about this shape:

1. **The Planning Session Service and the Build Orchestrator are
   deliberately separate services**, not two phases of one state machine.
   Phase 2 is a bounded, human-paced, conversational process — it doesn't
   need Temporal's crash-resumption guarantees at the same rigor a
   multi-hour autonomous build does (it's still persisted to Postgres
   incrementally, so a page refresh doesn't lose progress, but it isn't a
   durable *workflow* in the Temporal sense). Only once a Build Spec is
   frozen does the heavier, durable machinery take over.
2. **Postgres (Neon) is the single source of truth across both services** —
   the Decision Log table is written by the Planning Session Service during
   Phase 2 and read by Coder/Reviewer agents as design memory during the
   build, so architecture rationale isn't lost at the handoff.
3. **Everything server-side runs on Node.js — deliberately, not by
   default.** Hono, the Planning Session Service, the Build Orchestrator's
   Temporal workers, and the Coder/Tester/Reviewer/DevOps agent workers all
   need either the Temporal TypeScript SDK (Node-only) or a long-lived SSE
   connection without an execution-time ceiling. Rather than splitting the
   API onto an edge runtime and everything else onto Node, v1 keeps the
   whole backend on one runtime — see §7 for the full reasoning.

---

## 2. Planning Session Service (Phases 0–3)

### 2.1 Responsibilities
- Hosts the Analyst agent (Phase 1: idea → requirements doc via capped MCQ
  rounds) and the Planner/Architect agent (Phase 2: requirements →
  architecture graph + task graph, live-streamed, edit-prompt-aware).
- Owns the **Decision Log** table (see §4) — every decision either agent
  makes, and every user edit prompt, is a row here, tagged
  `source: agent | user`.
- Streams state to the client over **Server-Sent Events**: a single
  `GET /api/sessions/:id/stream` endpoint emits diagram deltas, decision log
  entries, question batches, and the confirm-readiness/consistency-check
  result as they're produced. Each event carries an incrementing `id`.
- **Reconnection**: SSE's built-in behavior means a dropped connection or
  tab refresh triggers the browser to automatically reconnect and resend
  the last event `id` it saw (via the standard `Last-Event-ID` header). The
  server responds by reading any Decision Log / graph-delta rows newer than
  that id straight from Postgres and replaying them, then resumes the live
  tail. This works cleanly because Postgres is already the durable source
  of truth for this data — the SSE stream itself holds no state that isn't
  also sitting in a table.
- Client→server traffic (MCQ answers, free-text edit prompts) travels over
  ordinary POST endpoints, not the SSE channel — SSE here is one-way by
  design, matching the product decision to keep this simple rather than
  standing up a bidirectional WebSocket server.
- On confirmation, freezes the current graph + requirements + decision log
  into an immutable, content-hashed **Build Spec** row, and either renders
  it for export (Fork A) or hands it to the Build Orchestrator (Fork B).

### 2.2 Question generation (Analyst agent)
- Input: raw idea text.
- Output per round: a batch of question objects:
  ```json
  {
    "id": "uuid",
    "text": "How will users authenticate?",
    "type": "single_select | multi_select",
    "options": ["Email + password", "OAuth (Google/GitHub)", "None needed", "Other"],
    "affects": ["auth_model", "user_model"]
  }
  ```
- Hard cap: 2 rounds, ~5 questions/round. Anything still unresolved after
  that is logged as an explicit assumption in the Requirements Document
  rather than triggering a third round — a demo/product with unbounded
  interrogation rounds is a worse experience than one that occasionally
  assumes something and shows its work.
- `affects` lets the UI re-trigger only the relevant follow-up questions
  when a user edits an earlier answer, instead of restarting the round.

### 2.3 Architecture streaming (Planner/Architect agent)
- Produces graph nodes (service, datastore, external dependency, task) and
  edges incrementally; each node emission is paired with a Decision Log
  write in the same transaction, so the UI's two panes (§4 of the UX spec)
  can never drift out of sync — they're reading the same commit.
- Accepts a `user_prompt` message type at any point during this phase. On
  receipt: the agent identifies affected existing nodes (via a dependency
  graph maintained alongside the visual graph — not just re-prompting the
  LLM with "here's everything, redo it"), re-derives those nodes, marks
  superseded ones, and emits deltas for both the graph and the log.
- Before allowing confirmation, runs a bounded self-consistency pass
  (essentially an internal Reviewer call scoped to the graph rather than
  code) — dangling dependencies, contradicted requirements, or orphaned
  nodes block confirmation with a specific, listed reason each.

### 2.4 Failure handling during planning (distinct from §3.1's escalation gates)
Phase 2 is human-attended, so it doesn't need the retry-budget/escalation
machinery the build pipeline (§3) uses for unattended execution. A failed
Analyst/Planner LLM call retries automatically with backoff; if it's still
failing, the affected SSE-streamed pane surfaces an inline error with a
manual "try again" action. No retry counter, no approve/redirect/abandon
choice — the person is already there to just ask again.

### 2.5 Build Spec artifact
```json
{
  "build_spec_id": "uuid",
  "content_hash": "sha256:...",
  "requirements": { ... },
  "architecture_graph": { "nodes": [...], "edges": [...] },
  "task_graph": [ { "task_id": "...", "description": "...", "acceptance_criteria": "...", "depends_on": [...] } ],
  "decision_log_ids": ["...", "..."],
  "frozen_at": "iso8601"
}
```
This is the one artifact both forks consume. Fork A renders it into
documents; Fork B hands `task_graph` (plus the referenced decision log
entries, for agent context during the build) to the Build Orchestrator
unchanged.

---

## 3. Build Orchestrator (Fork B — sealed execution)

Everything in this section is functionally the same system as the original
spec's orchestrator, with the state machine renamed to avoid colliding with
the new user-facing "Planning" phase name, and with no user-editing surface
— only the escalation-gate mechanism below.

- Implemented as a **Temporal Cloud** workflow (managed, not self-hosted,
  for v1 — see §7 for why).
- Explicit phase state machine: `Queued → Building → Testing → Reviewing →
  Fixing → Shipping → Done | Failed`. "Queued" replaces the old "Planning"
  phase name — by the time a run reaches the orchestrator, architecture and
  task decomposition are already done; this phase is just accepting the
  task graph and dispatching the first tasks.
- Each phase has a **retry budget** (default: 3 cycles) before
  auto-escalating to a human approval gate.
- Orchestrator never calls an LLM directly — it only dispatches tasks to
  the message bus and reacts to results.
- Durable execution: a crashed orchestrator pod resumes mid-run with no
  lost state and no re-running of completed tasks.
- Build progress is exposed to the client the same way Phase 2 is: a
  `GET /api/builds/:id/stream` SSE endpoint, backed by the same
  run/task/message Postgres tables the orchestrator already writes to, with
  the identical reconnect-and-backfill behavior described in §2.1. No
  separate push mechanism is needed for build progress vs. planning
  progress — it's the same pattern against different tables.

### 3.1 Escalation gates (not to be confused with Phase 2 editing)
When a phase exhausts its retry budget, the specific stuck task pauses and
the user is shown three options: **approve** (accept current state and move
on), **redirect** (give the Coder agent a specific new instruction for just
this task), or **abandon** (drop this task, continue with the rest of the
build, flag it as incomplete in the final delivery summary). This is
deliberately narrow — it is not a route back into re-architecting, and the
UI should present it as visually distinct from Phase 2's open-ended editing
so users never confuse "the system is stuck on one task" with "I can change
the plan now."

---

## 4. Data & memory layer

### 4.1 Decision Log (replaces vector DB for v1)
A single Postgres table, append-only:
```sql
decision_log (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,  -- denormalized for cheap org scoping (ADR-36)
  build_spec_id UUID,        -- null during Phase 1/2 pre-freeze
  session_id UUID,
  phase TEXT,                -- 'requirements' | 'architecture' | 'build'
  actor TEXT,                -- 'analyst' | 'planner' | 'coder' | 'reviewer' | 'user' | ...
  decision TEXT,
  rationale TEXT,
  alternatives_considered TEXT,
  supersedes UUID REFERENCES decision_log(id),
  created_at TIMESTAMPTZ
)
```
Agents query this with plain filtered/keyword lookups (by `session_id`,
`phase`, `actor`, or text search on `decision`/`rationale`) before making a
new decision, to avoid contradicting something already decided. This is
sufficient for the task sizes this system targets — the original vector-DB
"semantic design memory" was solving a retrieval problem this project isn't
actually big enough to have yet. If a concrete case emerges where keyword
lookup genuinely fails to surface a relevant prior decision, that's the
trigger to reconsider — not a default assumption to build for up front.

### 4.2 Postgres (metadata source of truth) — hosted on Neon
Runs, tasks, messages, sessions, Build Specs — unchanged in spirit from the
original spec, now also housing the Decision Log above and the Better Auth
organization-plugin tables (organizations, members, invitations — ADR-36).
**Multi-tenancy:** every tenant-scoped table (`sessions`, `build_specs`,
`runs`, `tasks`, `messages`, and the denormalized column on
`decision_log`) carries a non-null `organization_id`. A personal
organization is auto-created at signup, so there is exactly one ownership
model — no separate user-owned vs org-owned code paths. Every query in the
data-access layer is org-scoped, and org membership is checked in
middleware before any session/build access. Hosted on **Neon**
(serverless Postgres), accessed via **Drizzle** as the query/ORM layer —
Drizzle is confirmed (ADR-21), chosen because
it's the standard, well-documented pairing with Hono + Better Auth + Neon;
swapping it for Prisma later is a contained change since nothing outside
the data-access layer should reference the ORM directly.

### 4.3 Object storage (S3)
Generated repos, diffs, build artifacts, logs, and exported spec-doc
bundles (Fork A output).

### 4.4 Concurrency limits: one active session, one active build, per user
Each user account may have at most one active planning
session and one active build running at a time (ADR-29) — not several in parallel.
Mechanically, this is a partial unique index rather than application-level
polling: `sessions(user_id) WHERE status = 'active'` and an equivalent
constraint on the runs table for builds. Attempting to start a second
concurrent session or build is rejected at the database layer and the API
returns the existing active one rather than creating a duplicate — this
also means the enforcement can't drift out of sync with a check written
only in application code. Org membership doesn't relax these limits —
they're per user, not per organization (ADR-36).

---

## 5. Agent roster

| Agent | Phase | Tool access | Notes |
|---|---|---|---|
| **Analyst** | 1 | Read-only on the raw idea + prior answers; no execution | Generates MCQ batches; produces Requirements Document |
| **Planner / Architect** | 2 | Read-only repo/context; no execution | Interactive during Phase 2 only; produces architecture graph + task graph; not re-invoked during the build |
| **Coder** | Build (Fork B) | Sandboxed code execution, file write | Unchanged from v0 |
| **Tester** | Build (Fork B) | Sandbox execution (read-only on source, can run tests) | Unchanged from v0 |
| **Reviewer** | Build (Fork B) | Read-only diff access, no execution | Unchanged from v0; also used in a lightweight form for the Phase 2 consistency check (§2.3) |
| **DevOps** | Build → delivery | Scoped packaging + GitHub push credentials only, no source write, **no deploy target access in v1** | Scope narrowed from v0 — packaging/deploy is now packaging + repo push only; live deployment is v2 |

### 5.1 Model routing via OpenRouter

Every agent LLM call, across both services, goes through **OpenRouter** as
a single gateway rather than integrating each model provider's API
directly. Concretely: an OpenAI-compatible client pointed at
`https://openrouter.ai/api/v1`, one API key, and the model chosen per call
by a single string parameter.

**Role → model mapping.** Stored as a small config table (`model_routing`:
`role`, `model_slug`, `zdr_only`), not hardcoded in agent code — this keeps
it swappable without a redeploy and gives the eval suite (§10.2) a clean
lever to test routing changes against the fixed task set:

| Role | Tier | Rationale |
|---|---|---|
| Analyst | Reasoning (top tier) | Question quality is the first thing a user judges the product on |
| Planner / Architect | Reasoning (top tier) | Same — this is the decision the user watches happen live |
| Reviewer | Reasoning (top tier) | Also used for the Phase 2 consistency check (§2.3); needs to actually catch contradictions |
| Coder | Fast/cheap tier | High call volume, routine implementation work |
| Tester | Fast/cheap tier | High call volume, mostly mechanical (run suite, parse structured output) |
| DevOps | Fast/cheap tier | Minimal LLM use — commit messages only, no source-level reasoning |

Exact model slugs (e.g. `anthropic/claude-...`, `openai/gpt-...`) are
deliberately left as config values, not fixed in this document — they're a
one-string change in the routing table, and pinning specific model names
in a spec that outlives model release cycles is the wrong kind of
precision.

**Fallback: same model, different provider (ADR-26).** Rather
than falling back to a *different model* if a role's primary is
unavailable (broader resilience, but inconsistent output character), each
role pins one model and lets OpenRouter's provider-level routing fail over
across whichever providers host that same model. This favors predictable
quality over maximum uptime. The one edge case worth naming: if literally
every provider for a pinned model is down, the call errors outright rather
than silently swapping to a different model — that failure surfaces to the
calling agent and is handled by the existing retry-budget/escalation
mechanism (§3.1), not a silent model substitution. See §12 for the
corresponding failure-mode entry.

**Data handling: Zero-Data-Retention providers only (ADR-27, confirmed).**
Every role sees content derived from the user's idea (Coder/Tester see
generated code, not just Analyst/Planner see the idea itself), so v1 sets
`provider: { zdr: true }` on every call, restricting routing to endpoints
that don't log or train on request data. Implementation notes: first-party
Anthropic/OpenAI/Google-AI-Studio endpoints are *not* ZDR — ZDR reaches
those models via Bedrock/Vertex/Azure; the live endpoint list is
`GET https://openrouter.ai/api/v1/endpoints/zdr`. Role-mapping consequence:
Claude is the only frontier family with two ZDR providers (Bedrock +
Vertex), i.e. the only one where ADR-26's same-model fallback actually
fails over under ZDR; GPT (Azure) and Gemini (Vertex) are single-host.
Open-weight models (DeepSeek/Qwen/Llama) have 3–5 ZDR hosts each. Consider
pairing `zdr: true` with a provider allowlist of vetted hosts — third-party
ZDR is contractual, not audited. Verified against real routing responses in
Phase 3 (`05_build_plan.md`).

**Cost tracking rides on OpenRouter's own metadata — combined with sandbox
cost into one figure.** Every OpenRouter response includes `total_cost` and
`usage` fields per request. On its own, though, that's only LLM spend — a
run's real cost also includes E2B sandbox time. The per-run and per-tenant
(per-organization, ADR-36)
budget circuit breaker (§9) tracks a single combined figure (OpenRouter
cost + E2B cost) against one hard cap, rather than two separate budgets to
reason about. A run can blow its budget on sandbox time alone just as
easily as on LLM calls, so splitting them would just create a way for
total spend to quietly exceed what the number on screen suggests.

---

## 6. Sandbox execution

**Default for v1: E2B**, a managed sandbox provider built specifically for
AI agent code execution, Firecracker-microVM-based under the hood. Rationale:
self-hosting a Firecracker fleet only becomes cost-effective at real volume
(roughly 500+ sandbox-hours/month before bare-metal self-hosting beats a
managed CPU-only plan, and materially higher than that for the fully
managed-vs-self crossover) — there's no reason to carry that operational
burden before this system has enough usage to justify it. This is a
build-vs-buy call, not a lowering of the isolation bar: E2B still gives
per-run ephemeral, network-restricted, filesystem-wiped sandboxes with the
same real kernel-level isolation boundary the original spec called for.

Self-hosting the sandbox fleet is deferred to v2 as an explicit
cost-crossover decision (see `03_future_improvements_v2.md`).

---

## 7. Runtime & hosting decisions

### 7.1 Hono runs on Node.js, not edge/Workers
Hono is runtime-agnostic by design — it runs unmodified on Node.js,
Cloudflare Workers, Bun, Deno, or Vercel Edge. For this system specifically,
**Node.js is the right target**, for one non-negotiable reason and two
supporting ones:

- **Non-negotiable:** the Temporal TypeScript SDK requires Node.js — it
  uses native bindings via a Rust core and does not run on Cloudflare
  Workers or Vercel Edge. Since the Build Orchestrator (§3) is built on
  Temporal, at least *some* part of this system must run on Node regardless
  of what the API layer does.
- **Supporting reason 1:** the SSE streams in §2 and §3 are long-lived
  connections (a planning session or a build can stay open for minutes).
  Edge/Workers runtimes generally impose execution-time or CPU-time limits
  that a plain Node process doesn't have to work around.
- **Supporting reason 2:** the Coder/Tester/Reviewer/DevOps agent workers
  need to make LLM calls, talk to E2B, and interact with Temporal activities
  — all straightforward on Node, all awkward or unsupported on edge
  runtimes.

Given all of that, splitting the system so Hono runs on the edge while
everything else runs on Node would add a second runtime to operate for no
real benefit — v1 runs **Hono as a single persistent Node.js service**,
alongside (not split from) the Planning Session Service logic, the Temporal
worker processes, and the agent workers. Better Auth is mounted directly
into this Hono service (native adapter — see §8), and the Next.js app talks
to it purely over HTTP/SSE, with no server-side coupling between the two.

Hosting for this Node service is an infrastructure choice, not a structural
one — anywhere that runs a persistent Node process works (Fly.io, Railway,
Render, or a plain container on a VPS). This spec doesn't pin down a
specific host; treat it as swappable.

### 7.1.1 Rate limiting and CORS
The original v0 spec bundled auth, rate limiting, and WS upgrade into one
generic "API Gateway" box. Once that became "Hono directly," rate limiting
and cross-origin handling needed an explicit home rather than quietly
falling out — they're Hono middleware, applied before any route handler
runs: a standard rate-limit middleware (per-user and per-IP) in front of
both the REST endpoints and the SSE stream endpoints, and `hono/cors`
configured for the Next.js origin with `credentials: true` (required for
Better Auth's session cookies to survive a cross-origin request, per
Better Auth's own Hono integration notes).

### 7.2 Temporal Cloud, not self-hosted Temporal

**Default for v1: Temporal Cloud**, not self-hosted Temporal. This keeps
the durable-execution guarantee (crash-resumption, no lost state, no
re-running completed steps) without requiring you to run and operate a
Temporal cluster (Postgres/Elasticsearch backing store, worker fleet,
versioning discipline) before there's a real usage volume to justify that
ops investment. One implementation note worth flagging early: Temporal
workflow code has strict determinism constraints (no non-deterministic
logic inside workflow functions) — this trips up most first-time Temporal
users and is worth budgeting real learning time for regardless of
Cloud-vs-self-hosted.

Self-hosting is deferred to v2 as a cost-crossover decision, once Temporal
Cloud subscription cost exceeds what self-hosted ops would cost — this is a
number you can actually track once real usage exists, not a guess to make
now.

---

## 8. Authentication & GitHub delivery flow

**Better Auth** is mounted directly into the Hono service at `/api/auth/*`,
using Better Auth's native Hono adapter. The Next.js app talks to it
through Better Auth's client SDK (session cookies, `useSession`, etc.) —
no custom auth code on the frontend side. The **organization plugin** is
enabled for multi-tenancy (ADR-36): organizations, memberships,
invitations, and the stock owner/admin/member roles all come from the
plugin, and a personal organization is auto-created at signup so every
user always acts inside an org context.

### 8.1 Primary sign-in
The combination of email/password and OAuth providers (Google, GitHub,
etc.) offered for account creation is a product decision
independent of this spec — Better Auth supports both out of the box.
**Sign-in is required before a planning session can be created** (ADR-35)
— there are no anonymous sessions, so every session, build, and cost
record has a `user_id` and an `organization_id` from its first row. What
matters structurally is the next part:

### 8.2 GitHub connection is separate from sign-in — by design
Connecting GitHub for code delivery is **always a
distinct step** (ADR-23), regardless of how the user originally signed in — even a
user who signed in *with* GitHub still goes through this step separately,
since sign-in and repo-push are different grants of trust.

Mechanically, this uses Better Auth's `linkSocial` method, called with the
GitHub provider and the specific scope needed for repo access:
```ts
await authClient.linkSocial({
  provider: "github",
  scopes: ["repo"],
});
```
This triggers its own OAuth flow and attaches the resulting access token to
the user's account (Better Auth's account table), independently of whatever
provider — or none — they used to sign in. A few consequences worth
stating explicitly:

- The UI should only prompt for this connection when a session actually
  reaches Fork B (or when the user explicitly wants to set it up ahead of
  time) — never at sign-up, since most sessions may end at Fork A (spec
  export) and never need it.
- The token is scoped narrowly (`repo`, for push access) and used only by
  the DevOps agent at delivery (§11). It is never used to read, list, or modify
  anything else in the user's GitHub account.
- **GitHub connection is additive, not required.** A user who never
  connects GitHub can still complete Fork B and receive the downloadable
  archive — the push option simply won't be offered until they connect.
- **The token is always a per-user credential, never an org-shared one**
  (ADR-36) — a build pushes with the initiating user's token; other org
  members never inherit or reuse it.

---

## 9. Observability

Unchanged from v0 in spirit: OpenTelemetry tracing with a `trace_id`
threaded through every agent call and tool invocation across *both*
services (Planning Session Service and Build Orchestrator, so a full run
can be traced from the original idea through to delivery); per-run and
per-tenant (per-organization, ADR-36) token/cost meter with hard circuit
breakers; full audit log of every tool call and generated code artifact.

---

## 10. Development & testing strategy (new)

Two additions that weren't in v0, both aimed at making this buildable and
measurable rather than a one-off demo:

### 10.1 LLM response record/replay cache
Every LLM call made by any agent, in either service, can be recorded
(prompt + response, keyed by a hash of the input context) and replayed
deterministically in a dev/test mode. Because every call goes through
OpenRouter, the cache key also records which model and provider actually
answered (from the response metadata) alongside the pinned `model_slug`
requested — useful both for replay fidelity and for the eval suite (§10.2)
to distinguish "this got worse because of a routing config change" from
"this got worse because a provider silently changed model behavior
underneath a pinned slug." This is the difference between iterating on
orchestration logic (retry routing, phase transitions, message schemas,
the Phase 2 dependency-aware re-derivation logic) at the speed of a unit
test versus at the speed and cost of a live model call every time. Live
calls are still used for anything actually testing model behavior; replay
is for testing everything around it.

### 10.2 Fixed evaluation suite
A small, fixed set of 15–20 idea specs of increasing difficulty, run
end-to-end through both services, with pass rate, retry count, escalation
frequency, and cost-per-task tracked per system version. This turns "is the
system getting better" into a chart instead of an impression, and gives
Fork A (spec quality) and Fork B (build success rate) independent,
trackable metrics rather than one blended sense of "does it work."

---

## 11. Delivery (end of Fork B)

DevOps agent packages the finished repo and offers both:
- A downloadable archive, and
- A push to a repo in the user's own GitHub account (new repo or an
  existing empty one), using the access token obtained via the separate
  `linkSocial` GitHub-connect step described in §8.2.

Both are offered together, not either/or. If the user hasn't connected
GitHub yet, they still get the downloadable archive — connecting GitHub at
that point simply unlocks the push option, it doesn't block delivery.

If the build ends via an abandoned escalation gate rather than full
success, the same two delivery options are offered for whatever completed
and passed review — a partial result is never downgraded to
download-only; it gets a clear summary of what's missing alongside the
same archive + push choice.

No live hosting or deployment target in v1 — see v2 doc.

---

## 12. Failure modes & mitigations (updated)

| Failure mode | Mitigation |
|---|---|
| Infinite Coder ↔ Reviewer negotiation loop | Hard retry cap per phase; auto-escalate to human gate |
| Context drift on long runs | Periodic summarization/compaction step in the state machine |
| Sandbox crash mid-test | Temporal durable execution resumes without re-running completed steps |
| Runaway token spend | Per-run and per-organization hard budget circuit breaker (ADR-36) |
| Agent hallucinating a false "pass" | Tester output is structurally validated (exit codes, structured JSON), never trusted as free text |
| **(new)** User edit prompt contradicts an already-confirmed requirement | Planner/Architect states the contradiction plainly in the decision log and asks a clarifying MCQ rather than silently picking an interpretation |
| **(new)** A user edit invalidates many downstream nodes at once | Dependency-aware re-derivation only touches actually-affected nodes; invalidated nodes are visually flagged "revised," never silently deleted |
| **(new)** Phase 2 consistency check finds contradictions at confirm time | Confirmation is blocked with a specific, itemized list of what's unresolved — never auto-resolved silently |
| **(new)** A role's primary model's provider has an outage | OpenRouter's provider-level routing automatically fails over to another provider serving the same model — transparent, no code change needed |
| **(new)** Every provider for a pinned model is down at once | The call errors outright rather than silently substituting a different model (per the same-model-only fallback choice); surfaces to the calling agent and is handled by the existing retry-budget/escalation mechanism, not a silent quality change |
| **(new)** An Analyst/Planner LLM call fails during Phase 2 | Automatic retry with backoff; if still failing, an inline error with a manual "try again" button — no retry-budget counter, since a human is already present (§2.4) |
| **(new)** User tries to start a second concurrent session or build | Rejected at the database layer (partial unique index, §4.4); API returns the existing active one instead of creating a duplicate |
| **(new)** Cross-tenant access attempt (user requests a session/build outside their org) | Every data-access query is org-scoped and membership-checked in middleware; `organization_id` is non-null on all tenant-scoped tables (ADR-36) — enforced at the API, not just hidden by the UI |

---

## 13. Tech stack summary (updated)

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js (App Router) | User-specified |
| API | Hono, persistent Node.js service (not edge) | User-specified framework; Node required by Temporal SDK + long-lived SSE (§7.1) |
| Rate limiting / CORS | Hono middleware (`hono/cors` + rate-limit middleware) | Explicit home for what v0's generic "API Gateway" bundled implicitly (§7.1.1) |
| Auth | Better Auth, mounted in the Hono service | User-specified; native Hono adapter; `linkSocial` handles the separate GitHub-connect step (§8); sign-in required before any session (ADR-35) |
| Multi-tenancy | Better Auth organization plugin; non-null `organization_id` on every tenant-scoped table | Orgs/memberships/invitations without custom auth code; org-scoped queries + membership middleware (ADR-36) |
| LLM gateway | OpenRouter (single API, role-pinned models, ZDR-only, same-model provider fallback) | User-specified; one integration point, built-in per-request cost metadata, provider-level failover (§5.1) |
| Planning Session Service | Custom logic inside the Hono service, Postgres-backed, SSE | Bounded, human-paced, doesn't need full workflow durability |
| Build orchestration | Temporal Cloud | Durable execution without self-hosted ops burden in v1 |
| Message bus | Redis Streams | Simple to operate first; NATS JetStream is a scale-driven upgrade, not a v1 need |
| Sandbox | E2B (Firecracker-based, managed) | Real isolation without a self-hosted fleet before there's volume to justify it |
| Database | Neon (serverless Postgres) | User-specified |
| ORM | Drizzle (ADR-21) | Standard pairing with Hono + Better Auth + Neon; swappable |
| Design/decision memory | Postgres `decision_log` table | Doubles as the Phase 2 UI feed; sufficient for this scale; no vector DB in v1 |
| Real-time transport | Server-Sent Events | User choice; sufficient since client→server traffic is ordinary POST |
| Object storage | S3 | Repos, diffs, artifacts, exported spec bundles |
| Observability | OpenTelemetry (export backend not pinned — Grafana Tempo is the likely default) | Full trace across both services |
| Dev/test | Record/replay LLM cache + fixed eval suite | Fast iteration + measurable quality over time |

---

## 14. Milestones (revised)

1. **M0 — Interactive planning MVP**: scaffold Next.js + Hono (Node.js) +
   Better Auth (incl. organization plugin, personal org auto-created —
   ADR-35/36) + Neon/Drizzle + OpenRouter (role-pinned models per §5.1),
   wire up sign-in end to end, then build the Analyst (MCQ rounds) +
   Planner/Architect (live diagram + decision log over SSE, edit-prompt
   handling) + Fork A (spec export). No build pipeline required yet — this
   is a complete, shippable slice of the product on its own, and de-risks
   the hardest UX problem before the backend build pipeline needs to exist
   at all.
2. **M1 — Single-agent build loop**: one Coder agent, E2B sandbox exec, no
   orchestration yet. Prove the sandbox + tool-calling pipeline end to end.
3. **M2 — Two-agent loop**: add Tester, wire up pass/fail feedback.
4. **M3 — Orchestrator**: introduce the Temporal Cloud state machine, retry
   budgets, durable execution.
5. **M4 — Full build team**: add Reviewer, DevOps; structured message
   envelopes on the bus; Fork B end-to-end (Build Spec → delivered repo).
6. **M5 — Build-phase dashboard**: starts as a structured timeline/log view
   of agent activity (fast to build, immediately useful); the richer live
   agent-graph visualization for the *build* phase specifically (distinct
   from the Phase 2 architecture diagram, which is already live from M0) is
   a fast-follow once the underlying loop is reliable — sequencing, not a
   v2 deferral.
7. **M6 — Observability & cost controls**: tracing across both services,
   budget circuit breakers, audit log, eval suite wired into CI so every
   change reports its effect on pass rate/cost/retries.

---

## 15. Success criteria (system layer)

Carried forward from v0, plus the Phase 2 additions already listed in the
UX spec:
- Given a Build Spec, the build pipeline produces a repo that builds,
  passes its own generated tests, and is reviewed by at least one agent
  round before being marked done.
- A build run survives an orchestrator pod restart without losing state or
  re-running completed phases.
- Phase 2's live diagram/log renders within ~500ms of a decision being
  made, with no dropped events under normal load.
- Any run (planning or build) can be fully replayed from its trace/decision
  log — same inputs, inspectable decision path.
- A stuck/looping build phase terminates on its own via retry budget, never
  runs indefinitely, and always surfaces to a human via the narrow
  escalation-gate mechanism, not open re-architecture.
