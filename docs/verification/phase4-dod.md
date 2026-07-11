# Phase 4 — Definition-of-Done verification

Phase 4 (build plan §Phase 4) is scoped to polish only: the live
agent-graph visualization for the build phase, plus any UX-refinement
backlog items introducing no new decisions. Its DoD has three legs:
Doc 2 §15's success criteria satisfied end to end, v1 feature-complete
against Docs 01–04 with no master-table gap, and a security review of
what the polish pass touched. This records the evidence for each.

## 1. Doc 2 §15 success criteria — evidence map

| Criterion (02 §15) | Evidence |
|---|---|
| Build Spec → repo that builds, passes its own generated tests, reviewed ≥1 agent round before done | M4 full-pipeline integration test (real Docker + `buildTask` → `reviewing` → `shipping` → `done`); ADR-54 advisory Reviewer runs on every terminal path; eval suite first recorded run 15/16 pass (`docs/evals/history.jsonl`, the 16th is a designed-failure fixture) |
| Build run survives an orchestrator pod restart without losing state or re-running completed phases | M3 headline crash-resume integration test: worker1 completes task A, is replaced by worker2, A's activity fires exactly once (real local Temporal server; re-verified in Phase 3's gated Temporal suite, 34 tests) |
| Phase 2 diagram/log renders within ~500ms of a decision, no dropped events under normal load | Phase 1 live verification against the SSE-shape-accurate mock: per-decision atomic transactions (02 §2.3), advisory-lock publish so a slow-committing transaction can't be skipped (ADR-38), `Last-Event-ID` replay exact, client-side dedupe by event id |
| Any run fully replayable from its trace/decision log | ADR-11 record/replay cassettes at the fetch boundary (replay miss = hard error, D2); eval replay mode (D3); append-only `decision_log` (ADR-08/39); one OTel trace spanning API → workflow → activity → LLM/tool spans (D1) |
| Stuck/looping build terminates via retry budget, always surfaces via the narrow escalation gate | M3 retry-budget tests (budget consumes N then fails; `budget_exceeded` short-circuits); M4 escalation-gate integration with real human signals (approve/abandon/redirect; 30-min `condition()` timeout → abandon); eval suite's designed retry-exhaustion fixture escalates as designed |

Live-credential passes (real OpenRouter key, E2B, Temporal Cloud, GitHub
OAuth) remain deferred with ready harnesses, as recorded in
`phase3-verification.md` — deferred-with-trigger, not gaps.

## 2. Feature-completeness / master-table gap check

Phase 3 D4's ADR cross-check (three parallel evidence-demanding reviews)
found 60/60 ADRs implemented, zero paper-only. The build plan §6 master
table rows still carried pre-execution 🔧 markers for ADRs 05–15, 19, 25,
28, 30–34; flipped to ✅ in this pass on that cross-check's evidence.
ADR-09 (E2B) and ADR-10 (Temporal Cloud) are ✅ with an explicit
live-creds annotation: the decision is implemented (port + guarded
driver select; workflow runs on local dev server + `@temporalio/testing`),
the managed-substrate swap is a credential/config change gated by the
documented triggers (E2B isolation parity; Temporal Cloud creds).

Phase 4's own scope check: the agent-graph is built (commit `cb42843`);
the UX-refinement backlog sweep found zero qualifying items — every open
follow-up is architecture-gated (ADR-53 Option A hydrate), cred-gated
(edit-answers `affects` filtering, live-model passes), or a behavior
change (LLM-authored commit messages), all excluded by this phase's
no-new-decisions mandate and left to their existing triggers.

## 3. Phase-end security review (touched surface)

Surface: commit `cb42843` only — frontend-only agent-graph (six files,
no new API routes, no new inputs, no new dependencies). Reviewed by a
dedicated security pass (injection/XSS on model-influenced task text and
spec ids, client-side DoS, data exposure, CSP-nonce compatibility, dep
surface) plus the two pre-commit review shards' rendering checks
(plain React text children everywhere; no `dangerouslySetInnerHTML`).

**Verdict: PASS — zero findings, all severities.** Every model-influenced
value (task description, spec ids, dependsOn) reaches only auto-escaped
React sinks; node/edge ids never hit a selector/`url(#…)`/CSS sink; the
inline-style path is a fixed enum-keyed CSS-var map set via CSSOM. No new
unbounded client work (mapping is O(V+E); dagre reuse; cardinality already
rendered by the task list) and no cross-tenant amplification (ADR-36 —
a pathological spec degrades only its own org's tab). No data exposed
beyond what the list/timeline already shows. Zero new CSP surface (same
@xyflow/react pattern the planning diagram already ships under the
per-request-nonce policy; new keyframes live in the bundled stylesheet).
Zero new dependencies or dynamic imports. One informational note —
duplicate node ids if two tasks shared a `specTaskId` — is moot:
`UNIQUE(run_id, spec_task_id)` (migration 0005) makes that state
unrepresentable.
