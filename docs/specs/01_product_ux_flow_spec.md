# Mullion — Product & Interactive Planning UX — Specification (v1)

## 0. Document scope

This document specifies the **user-facing experience**: what happens between a
person typing an idea and either walking away with spec documents or a
finished, delivered codebase. It is the front door to the system specified in
`02_system_architecture_spec.md`, which covers the backend/agent engine that
powers Fork B (automated build).

### Decisions locked in before writing this doc
Each is logged with rationale and alternatives in
`04_design_decisions_log.md`; restated here only because they shape the
flow below.
1. **Free-text change prompts are accepted only during the
   planning/architecture stage (Phase 2)** (ADR-02). Once the automated
   build starts, the user cannot inject arbitrary edits — the only
   human-in-the-loop moments during build are **system-initiated
   escalation gates**, a different, narrower mechanism (§5).
2. **The live architecture view renders as both a diagram and a decision
   log, side by side, kept in sync** (ADR-03), streamed over one-way
   Server-Sent Events (ADR-18) — see `02_system_architecture_spec.md` §2.1
   for the mechanics.
3. **Delivery is downloadable archive + push to the user's own GitHub**
   (ADR-04); live hosting is out of scope for v1
   (`03_future_improvements_v2.md` B5).
4. **One active planning session and one active build per user account**
   (ADR-29) — a second concurrent one is blocked/redirected, enforced at
   the database layer (`02_system_architecture_spec.md` §4.4).

### Assumptions made to keep this spec unambiguous
- Sessions are scoped to an organization (ADR-36); other org members can
  view a session, but only the user who created it edits/answers — no
  concurrent multi-user editing (deferred: `03_future_improvements_v2.md` A3).
- "MCQ-based" clarifying questions means single-select or multi-select with a
  free-text "Other" escape hatch on every question — never a dead end where
  the user's real answer isn't one of the options.
- A user can always leave and resume a planning session (state is persisted),
  but cannot resume mid-build (build is short enough to run to completion or
  to an escalation gate; see backend spec for durability guarantees there).

---

## 1. End-to-end journey

```
Phase 0          Phase 1              Phase 2                  Phase 3           Phase 4
Idea Intake  →  Requirements    →   Interactive          →   Confirmation  →   Fork
                Clarification       Architecture              & Freeze
                (Analyst, MCQ)      Planning                                  ┌─ A: Export Spec Docs (done)
                                    (Planner/Architect,                       └─ B: Automated Build (sealed)
                                     diagram + log,                                → Delivery
                                     user can edit)
```

Everything left of the Phase 3 freeze line is editable and conversational.
Everything right of it is sealed and runs without user interjection.

---

## 2. Phase 0 — Idea intake

**Input:** a single text field. Anything from one line ("a URL shortener with
rate limiting") to a short paragraph. Optional: project name.

**Validation before accepting:**
- Minimum viable length/specificity check. If the idea is too sparse for the
  Analyst to do anything with (e.g. "an app"), the system doesn't silently
  guess everything — it responds with 1–2 targeted questions right away
  (still MCQ-first) rather than entering a full clarification phase on
  nothing.
- Sign-in is required before a session can be created (ADR-35 — an earlier
  no-auth default, reviewed and reversed). The session is created inside
  the user's active organization (ADR-36); a personal org is auto-created
  at signup, so this adds no extra step for solo users.

**Output:** a raw idea record, timestamped, session created.

---

## 3. Phase 1 — Requirements clarification (Analyst agent)

**Goal:** turn a loose idea into a structured requirements document, using
the minimum number of question rounds needed — not an exhaustive interview.

**Mechanism:**
1. The Analyst agent reads the idea and identifies genuinely ambiguous or
   consequential dimensions — the ones where a wrong guess would force a
   redo later (e.g. auth model, expected scale, data persistence needs, who
   the primary user is, must-have vs. nice-to-have scope).
2. It generates a batch of questions, **each rendered as MCQ**: single-select
   or multi-select, 2–4 short options, always with an "Other (type your own)"
   option. No open-ended free-text question is presented as the *first*
   ask — free text is always a fallback, never the default.
3. Capped at **2 rounds, ~5 questions per round.** If confidence is still low
   after round 2, the Analyst proceeds anyway, but explicitly lists every
   assumption it made in the requirements doc, in plain language, flagged as
   editable.
4. User answers render immediately; the Analyst can ask a short round-2
   follow-up only if a round-1 answer opens a new fork (e.g. "multi-user" →
   "do you need roles/permissions?").

**Output:** a **Requirements Document** — functional requirements,
non-functional constraints (rough scale, latency expectations if given),
explicit assumptions list, and an explicit v1 scope boundary (what's
in/out). This is shown to the user as a readable summary, not raw JSON, with
an "edit answers" affordance that re-triggers only the affected downstream
questions rather than the whole round.

**Exit condition:** user clicks "Looks good, plan the architecture" →
Requirements Document is versioned and handed to Phase 2.

---

## 4. Phase 2 — Interactive architecture planning (Planner/Architect agent)

This is the centerpiece of the product experience: the user *watches the
system think*, in two synchronized views, and can steer it.

### 4.1 The two views

**A. Live diagram (left/primary pane)**
- Nodes appear incrementally as the Planner/Architect agent makes each
  decision: services, datastores, external integrations, major API
  surfaces, and the emerging task graph.
- Nodes are visually distinguishable by type (service, datastore, external
  dependency, task) and connections show data/call flow.
- A node that gets invalidated by a later decision (see §4.3) visually
  flags as "revised" rather than silently vanishing, so the user can see
  what changed and why.

**B. Decision log (right/secondary pane, scrolling)**
- Every decision the agent makes is a structured log entry:
  `{ decision, rationale, alternatives considered, source: agent|user, timestamp }`
- This is not cosmetic — it is the same structured log that the backend
  spec uses as the system's design memory (see `02_system_architecture_spec.md`
  §4.1, "Decision Log"). The UI is a live view onto
  that table, nothing more is generated for display purposes than what the
  system needs anyway.

Both panes stream over the same connection and stay in lockstep — a diagram
node and its log entry always appear together, never diagram-first or
log-first with a lag between them.

### 4.2 User edits during this phase

At any point while Phase 2 is active, the user can type a free-text prompt
("use Postgres instead of Mongo", "add rate limiting to the API", "we don't
need a message queue for this scale").

Handling:
1. The prompt is treated as a new input to the Planner/Architect agent, not
   a raw patch to the diagram.
2. The agent determines which existing decisions the prompt affects,
   re-derives only those and their downstream dependents (not a full
   re-plan from scratch), and streams the updated nodes/log entries the
   same way as an initial decision — marked `source: user` in the log for
   the prompt itself, `source: agent` for what it triggers.
3. If a prompt is genuinely contradictory or infeasible given earlier
   confirmed requirements, the agent says so plainly in the log and asks a
   clarifying MCQ rather than silently picking an interpretation.

### 4.3 Consistency check before confirmation

Before the "Confirm Architecture" button becomes enabled, a lightweight
Reviewer-style pass checks the current graph for internal contradictions
(e.g. a task depending on a datastore that a later edit removed). If it
finds any, it surfaces them to the user as a short checklist to resolve —
confirmation is blocked until the graph is self-consistent, not
auto-resolved silently.

### 4.4 Exit condition

User clicks **"Confirm Architecture."** This is an explicit, unambiguous
action — the system never auto-advances out of Phase 2 on its own
inference that the user is "done."

### 4.5 If an Analyst/Planner call itself fails

Distinct from the build pipeline's retry-budget/escalation-gate mechanism
(§5), which exists because Fork B runs unattended: Phase 2 has a human actively
watching, so failure handling here is simpler by design. A failed LLM call
(timeout, provider error) retries automatically with backoff; if it keeps
failing, the affected pane shows an inline error with a manual "try again"
button rather than escalating anywhere. There's no retry-budget counter or
approve/redirect/abandon choice here — the person is already present and
can just ask again.

---

## 5. Phase 3 — Confirmation & freeze

On confirmation:
- The Requirements Document + final architecture graph + task graph +
  full decision log are bundled into a single versioned, immutable artifact
  — call it the **Build Spec** (content-hashed, so both forks below operate
  on the literal same thing).
- From this point forward, **nothing about scope or architecture is
  editable via free text** (ADR-02).

### The one exception: escalation gates (not user edits)
During Fork B (below), the automated build pipeline has its own retry
budgets per phase (see `02_system_architecture_spec.md` §3). If a phase exhausts its retry
budget, the pipeline pauses and surfaces a **narrow, structured** decision
to the user: approve / redirect this specific task / abandon this task.
This is not re-opening architecture — it's a bounded intervention on one
stuck task. It's worth keeping these two mechanisms (free-form Phase 2
editing vs. narrow build-time escalation) clearly distinct in the UI so
the user always knows which mode they're in.

---

## 6. Phase 4 — The fork

After confirmation, the user picks one of two paths. Both consume the same
Build Spec artifact; nothing is regenerated for either path from scratch.

### Fork A — Export spec documents
- Renders the Build Spec into a downloadable bundle: requirements doc,
  architecture doc (with diagram exported as an image/SVG plus the
  structured graph as JSON), task graph, API contracts, and the full
  decision log.
- No build compute is spent. Session ends here, cleanly. A user can return
  later and choose Fork B on the same Build Spec if they change their mind
  — the spec doesn't expire (v1: no expiry policy needed at this scale).

### Fork B — Automated build ("build it for us")
- The Build Spec's task graph is handed directly to the automated build
  pipeline described in `02_system_architecture_spec.md`. Note: this
  reuses the exact task graph produced in Phase 2 — the build pipeline does
  **not** re-plan or re-derive architecture; it only executes, tests,
  reviews, and ships against what was already confirmed.
- The user is already authenticated (sign-in is required to start any
  session, ADR-35); Fork B attributes its compute spend to the session's
  organization (ADR-36).

---

## 7. Delivery (end of Fork B)

On successful completion of Fork B:
- User is offered a **downloadable archive** of the finished repo, and
- A **push to the user's own GitHub** — this requires connecting GitHub
  first, which is always a separate, explicit step from however the user
  originally signed in (even a user who signed in *with* GitHub still
  connects it separately here). The system prompts for this connection
  once a session actually reaches this point, not earlier.
- Both are offered together, not either/or (ADR-04).
- Live hosting/deployment of the finished app is explicitly **not** part of
  v1 delivery (see `03_future_improvements_v2.md`).

If the build pipeline fails permanently (all escalation gates exhausted and
the user chose "abandon" on a blocking task), the user still gets whatever
was completed and passed review up to that point — **offered exactly the
same way as a full success: downloadable archive and GitHub push both
available**, plus a clear summary of what's missing. A partial result is
never treated as a lesser, download-only outcome — never a silent dead end.

---

## 8. Non-goals for this UX flow in v1

Explicitly out of scope, to keep the phase model above clean:
- Editing architecture or requirements once Fork B has started.
- Multiple people editing the same planning session concurrently.
- A saved-sessions dashboard / template gallery.
- Live hosting or one-click deploy of the delivered app.
- Resuming mid-build after an interruption from the *user's* side (the
  backend's durability guarantees are about surviving infra crashes, not
  about letting a user pause and resume a running build).

---

## 9. Success criteria (UX layer)

- A user with a one-line idea reaches a confirmed architecture within the
  2-round question cap plus a bounded number of edit prompts — the flow
  should feel like a short focused conversation, not an interrogation.
- Every node in the live diagram has a corresponding, inspectable decision
  log entry — no decision ever appears "for free" without a rationale
  behind it.
- At every point in Phases 0–2, the user can answer "what would change if I
  said X instead?" by just saying X — no separate "edit mode" to enter.
- A user can always tell, from the UI alone, whether they're in editable
  (pre-freeze) or sealed (post-freeze) mode — this distinction should never
  require reading a tooltip to understand.
- Fork A (spec export) works completely independently of Fork B ever being
  reliable — the two paths must not be coupled such that a build-pipeline
  bug blocks someone who only wanted the documents.
