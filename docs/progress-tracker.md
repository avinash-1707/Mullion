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
| Phase 1 — Interactive Planning Experience | Done (live-LLM verification pending creds) | 2026-07-11 | Built + verified end to end against a mock OpenRouter; real-model pass needs OPENROUTER_API_KEY |
| Phase 2 — Automated Build Pipeline | In progress (M1–M2 done) | 2026-07-11 | M1 (Coder + sandbox) + M2 (Tester + budget breaker) built, verified, reviewed; M3–M4 next |
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

### [2026-07-11] Phase 2 M2 — Tester + pass/fail feedback + ADR-31 budget breaker
**Phase:** Phase 2 — Automated Build Pipeline (milestone M2)
**Type:** Progress update
**Summary:** Second build-pipeline milestone: added the Tester and wired a
pass/fail fix loop, and closed M1's ADR-46 self-grading gap. Verification is
now injected into `buildTask` as a `Verifier` dependency (M1's inline
verifier stays the default). M2's `makeTesterVerifier` runs each check in a
FRESH sandbox — copies the Coder's produced sources in, writes the
runner-owned test files LAST (overwriting any file the Coder named the same),
runs the test command, and takes the EXIT CODE as authoritative pass/fail.
This is a FILE-LEVEL guarantee — the Coder cannot edit or replace the tests
that grade it (proven by the integration test). It is NOT full tamper-proof
grading: the runner test still `require`s Coder source into the grading
process, so adversarial Coder code could subvert its own in-process run
(monkeypatch assert, force exit 0) — that needs out-of-process/black-box
grading, deferred (see ADR-48 known-limits). The `testerAgent` (fast tier,
one-shot AgentSpec) only parses raw output into structured failures for the
Coder's next fix turn — it cannot decide pass/fail. The Coder↔Tester loop is
a plain bounded loop inside buildTask (`maxTestFixCycles`, default 4; no
Temporal, no escalation gate — those are M3/M4); exhaustion →
`failed{reason:"test_failed"}`. Tester verdicts join the durable transcript
as a `test_report` envelope. ADR-31 combined LLM+sandbox budget breaker
(`packages/agents/src/budget.ts`): per-run (SUM cost_events by run_id + live
sandbox accrual so best-effort sandbox cost isn't under-counted) AND per-org
(rolling window); checked before every LLM call and each verification; trip →
`failed{reason:"budget_exceeded"}`. Planning's `isOrgBudgetExhausted`
(ADR-43) now delegates to the same `checkBudget`, so planning and build share
one breaker. New config RUN_BUDGET_USD. No migration (query logic + jsonb
result/envelope only).
**Verified:** full DoD green (`check-types`+`lint`+`build`+`test`, 107 unit
tests incl. tester agent, budget, verifier, fix-cycle, budget-trip) plus both
Docker integration tiers — the crux M2 test proves a Coder that plants a fake
passing test still FAILS (runner test overwrites it in the fresh sandbox) and
an honest Coder converges wrong→feedback→fix→verified; harness run against the
live dev DB + Docker produced run=done with a test_report in the transcript.
**Files/areas touched:** packages/{agents (tester/*, budget, coder/verify,
build-task),schemas (tester, agent-message, coder-tools),config}, apps/api
(planning/flows, dev/build-task-cli), docs/specs/{04,05}
**Related ADR:** New — ADR-48 (fresh-sandbox verification vs runner-owned
tests closes ADR-46), ADR-49 (ADR-31 combined breaker supersedes ADR-43);
`05` table extended 48–49
**Follow-ups:**
- Runner-owned tests are supplied to the verifier (harness/Build Spec);
  turning a task's prose acceptance_criteria into real tests (test authoring)
  is later work — M2 proves the tamper-proof mechanism, not test generation.
- M2 keeps run status building→done|failed; the real testing/fixing/reviewing
  state machine + escalation gates land with Temporal in M3/M4.
- Tester + fresh-sandbox verification are LLM/driver-agnostic but only run
  live against the mock/loopback so far; real-key + E2B passes ride the
  existing Phase-1/M1 cred follow-ups.

### [2026-07-11] Phase 2 M1 — single Coder + sandbox tool-loop built, verified, reviewed
**Phase:** Phase 2 — Automated Build Pipeline (milestone M1)
**Type:** Progress update
**Summary:** First build-pipeline milestone: one Coder agent driving one
frozen Build Spec task to verified-green through a bounded tool-calling
loop against a REAL local Docker sandbox — no orchestration (M3), no Tester
(M2), no UI (M5). New `packages/sandbox`: provider-agnostic `Sandbox` port
(non-zero exit = CommandResult, throws only on infra failure), hardened
`LocalDockerSandbox` (dockerode; --network none, read-only rootfs, tmpfs
/tmp noexec + /workspace exec, cap-drop ALL, no-new-privileges, pids/mem/cpu
limits, non-root, auto-remove, run-id labels), `E2bSandbox` stub compiling
against the real SDK, `FakeSandbox` for tests, `SANDBOX_DRIVER` select with
boot-time e2b-key guard, crash reaper. `packages/llm`:
`completeChatWithTools` sibling method (native OpenAI-compatible
tools/tool_calls, ZDR/cost/timeout reused). `packages/agents/src/coder`:
`buildTask(input, deps) → TaskResult` tool-loop runner beside `runAgent`
(withBackoff wraps only the transport call), four tools
(writeFile/readFile/runCommand/submit), runner-owned verification,
per-turn+inter-call caps (turns/wall-clock/combined LLM+sandbox cost),
durable per-turn transcript to `messages` with envelope validated on write.
DB migration 0004: tasks status/spec_task_id/acceptance_criteria/depends_on/
verify_command/result + `(id, org)` unique; messages task_id composite FK +
bigserial seq. Dev CLI harness (no HTTP route until M3) with startup reaper.
Verified end to end: DoD green (`check-types`+`lint`+`build`+`test`, 87 unit
tests) plus both Docker integration tiers (sandbox 9, agents e2e 1 — a real
`node --test` recovering from a real failing run to verified inside the
container); harness run against the live dev DB produced run=done,
task=verified, sandbox cost_event captured, 8-message transcript.
Multi-lens review (correctness/security/tests/blast-radius) → no Criticals;
fixed before commit: ambiguous 124/137 timeout mapping (now duration-
confirmed, parity with E2B), buildTask now always resolves to a TaskResult
(crashed reason wired), E2B writeFile wrapped + /workspace bootstrap +
fake-SDK unit coverage, Docker reaper unit coverage, writeFile/envelope cap
consistency (arguments cap raised past escaped 256KB), envelope parse
enforced at the DB write boundary, per-turn tool-call cap + mid-turn cap
re-checks, agents integration test split out of the unit run, reaper also
fails orphaned task rows.
**Files/areas touched:** packages/{sandbox (new),llm,agents,schemas,db,
config}, apps/api/src/dev, docs/specs/{04,05}
**Related ADR:** New — ADR-44 (Sandbox port + local Docker substrate),
ADR-45 (native function-calling + tool-loop runner), ADR-46 (crash
semantics + runner-owned verification), ADR-47 (hermetic sandbox network);
`05` master table extended 44–47
**Follow-ups:**
- M1 "verified" is not independent acceptance — the Coder writes the tree
  the verify command grades (ADR-46 known-limit); M2's Tester owns fixtures
  on a Coder-unwritable path to close it.
- E2B path is type-proven + unit-tested against a fake SDK but never run
  live (no key); the `/workspace` bootstrap + conversion need a real-key
  pass when one exists (rides the Phase-1 OpenRouter-key follow-up).
- Symlink read-escape inside the sandbox is contained by ro-rootfs/no-net/
  no-secrets, not by path resolution — add an in-sandbox realpath check when
  real mounts/secrets arrive (E2B, M2+).
- ADR-31 combined circuit breaker (M2) supersedes M1's per-task caps +
  ADR-43 stopgap; sandbox cost is currently best-effort-recorded — M2's
  budget enforcer must not read a missing sandbox cost as $0.
- Dependency provisioning (deps beyond the base image) is out of M1 by
  ADR-47 (--network none); an install strategy is an explicit M2+ decision.

### [2026-07-11] Phase 1 built, verified, security-reviewed
**Phase:** Phase 1 — Interactive Planning Experience
**Type:** Progress update
**Summary:** Full Phase 1 scope built and verified end to end (idea → MCQ
rounds → Requirements Document → live-streamed architecture planning →
consistency gate → edit re-derivation → confirm/freeze → Fork A export).
Backend: `packages/agents` (Analyst/Planner/Reviewer prompt+parse layers on
a shared AgentSpec contract, retry-with-backoff per ADR-30), streaming
OpenRouter client (`completeChatStream`, ADR-41 JSONL decision streaming,
cost from the terminal usage chunk), four new tables (mcq_rounds,
requirements_docs, graph_nodes, graph_edges) + session phase/agent-state/
graph-version columns (migration 0003), planning service with atomic
per-decision transactions (decision-log row + graph writes + SSE events
commit together per 02 §2.3), content-hashed immutable Build Spec freeze,
on-demand zip export (ADR-42: markdown docs + graph/task/decision JSON +
deterministic SVG diagram). Frontend: full planning UX (MCQ cards with
"Other" escape hatch, requirements doc view, React Flow live diagram +
decision log split panes, edit-prompt bar, consistency checklist, sealed
mode + fork cards), TanStack Query + zod-parsed SSE with snapshot-then-
resume (`?lastEventId=` fallback since EventSource can't set headers).
Icons standardized on react-icons (Lucide family) per owner request.
Everything verified live against a local mock OpenRouter (streaming
SSE-shape-accurate): full pipeline, retry path, sealed-mode 409s, ADR-29
conflict handling, cross-org 404s, SSE replay. 40 unit tests green;
`turbo build` + lint + typecheck clean.
Phase-end security review (3 parallel passes: authz/tenancy, LLM boundary,
frontend/transport) found no true Criticals; all actionable findings fixed
and re-verified live: atomic confirm gate (status+agent+graph-version
conditional update; double-confirm → 409), per-org rolling-24h spend
ceiling (ADR-43, verified 429), CSRF Origin gate on unsafe methods (evil
origin → 403), LLM request/stream/idle timeouts + 2MB stream cap, length/
array caps on every LLM-output schema (oversized fields now fail retryably
at parse, not mid-transaction), partial-plan fail-fast semantics (initial
re-plan wipes graph first; partial edit parks with a consistency-check
retry task), mid-stream best-effort cost capture, SSE membership recheck
every 60s, loopback-only OPENROUTER_BASE_URL, nosniff on export, byte-
accurate event payload cap.
**Files/areas touched:** packages/{schemas,llm,agents,config,db},
apps/api (planning/*, routes, sse, index), apps/web (planning UI)
**Related ADR:** New — ADR-41 (streamed JSONL planner), ADR-42 (on-demand
export bundle, S3 deferred), ADR-43 (stopgap org spend ceiling) added to
`04`; master table in `05` extended through ADR-43 (incl. backfilled
37–40 rows)
**Follow-ups:**
- Live-model verification (real OPENROUTER_API_KEY): full pipeline against
  actual Claude routing, prompt quality tuning on real outputs.
- "Edit answers" regenerates the full downstream (round 2 + doc) rather
  than only `affects`-filtered questions — spec'd refinement (01 §3) that
  needs real-model behavior to tune; revisit with live creds.
- Decision-log rows from a failed partial plan survive its re-run
  (append-only ADR-08 honored; graph is wiped and rebuilt) — duplicate-ish
  log entries possible after a mid-plan failure; acceptable for v1,
  fold any cleanup into Phase 2's compaction thinking.
- ADR-43's stopgap ceiling folds into ADR-31's real circuit breaker in
  Phase 2; stream_events composite-FK hardening rides Phase 2 schema work.
- Prod cookie topology decision still open from Phase 0 (CSRF Origin gate
  now in place either way).

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
