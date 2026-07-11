# Mullion — Project Overview

## What this is

**Mullion** is a platform that turns a one-line idea into either a
reviewable technical blueprint or a finished, working codebase — and lets
the person watch and steer the planning as it happens, instead of handing
an idea to a black box and waiting.

A user describes what they want to build. An Analyst agent asks a short,
capped round of multiple-choice clarifying questions. A Planner/Architect
agent then plans the actual system live, in front of the user — a diagram
and a decision log build up in real time, and the user can interrupt with
a plain-language change at any point ("use Postgres instead," "add rate
limiting"). Once the user confirms the architecture, they choose: walk
away with the full set of spec documents, or hand it to an automated
Coder/Tester/Reviewer/DevOps pipeline that builds, tests, and delivers a
real repository.

## Why this exists

Fully autonomous coding agents (Devin and similar) are effective but
opaque — you delegate a ticket and get a pull request back, with no
visibility into the reasoning in between. Assistive tools (Copilot,
Cursor, Claude Code) are the opposite: you're in the loop for every line,
which is powerful but doesn't scale to "build me a whole thing from
scratch." Open-source multi-agent frameworks (MetaGPT, ChatDev) already
explored the idea of a role-based agent team turning a spec into code —
but as research demos, without the production concerns that make a system
trustworthy to actually run: durable execution that survives a crash, real
sandboxed isolation for generated code, cost controls that can't run away,
and a way to replay exactly what happened and why.

This project sits between those: the planning stage is visible and
editable like working with a person, not a black box; and the engineering
underneath — the parts a user never sees — is held to the same bar as a
real production system, not a prompt-chaining demo.

## How it works

```
1. Idea            →  User describes what they want, in a sentence or two.
2. Clarify          →  Analyst agent asks capped rounds of multiple-choice
                        questions to fill in what's ambiguous.
3. Plan (live)      →  Planner/Architect agent builds the architecture in
                        front of the user — diagram + decision log,
                        editable by just saying what to change.
4. Confirm          →  User explicitly locks in the architecture.
5. Choose a path    →  Take the spec documents and go build it yourself,
                        or hand it to the automated build pipeline.
6. Build (optional) →  Coder, Tester, Reviewer, and DevOps agents
                        implement, test, and review the whole thing.
7. Deliver          →  A downloadable archive and/or a push to the user's
                        own GitHub repo.
```

Steps 1–4 are always conversational and editable. Step 6, if chosen, runs
unattended — the user isn't asked to babysit it, but is pulled in with a
specific, narrow decision if something gets genuinely stuck.

## What makes this different

- **The planning is visible, not a black box.** Watching the architecture
  get built, and being able to redirect it mid-thought, is the core
  experience — not a loading spinner between "idea" and "result."
- **Two honest exits, not one forced path.** A user who just wants a
  well-thought-out spec to hand their own team gets that, at no cost
  beyond the planning conversation itself. Building it automatically is a
  choice, not the only option.
- **Production engineering, not a research toy.** Durable execution that
  survives a crash mid-build, real sandboxed isolation for generated code,
  hard cost circuit breakers, and a full replayable trace of every
  decision — the things that separate "cool demo" from "something you'd
  actually trust to run."
- **The human stays in control at the right moments, not every moment.**
  Free-form steering during planning; narrow, specific decisions
  (approve/redirect/abandon) if the automated build gets stuck. Never
  either total autonomy or constant babysitting.

## Who it's for

Someone with a real idea for a piece of software who wants either a solid,
reviewable technical plan they can hand to a team — or a working first
version of it, without writing the implementation themselves.

## Tech stack, briefly

Next.js (frontend) · Hono on persistent Node.js (API) · Better Auth (auth)
· Neon/Drizzle (database) · OpenRouter (LLM gateway, multi-provider) ·
Temporal Cloud (durable orchestration) · E2B (sandboxed code execution) ·
Redis Streams (message bus) · S3 (artifacts) · OpenTelemetry
(observability) · Turborepo (monorepo). Full rationale for each choice is
in `02_system_architecture_spec.md` and `04_design_decisions_log.md`.

## Current status

v1 is feature-complete: all five build phases are done and verified, with a
security review at the end of each phase. Verification against live
credentials (real OpenRouter key, E2B, Temporal Cloud, GitHub OAuth) is
still pending. See `docs/progress-tracker.md` for the phase-by-phase status
and the running execution log.

## Where to go next

| Document | Read it for |
|---|---|
| `01_product_ux_flow_spec.md` | The full user experience, phase by phase |
| `02_system_architecture_spec.md` | How it's actually built — services, schemas, agents, infrastructure |
| `03_future_improvements_v2.md` | What's deliberately not being built yet, and why |
| `04_design_decisions_log.md` | The history of every decision made and who made it |
| `05_build_plan.md` | The five build phases and what each one delivers |
| `docs/CODING_STANDARDS.md` | Code-level conventions for anyone writing it |
| `docs/progress-tracker.md` | What's actually been built so far |
| `CLAUDE.md` (repo root) | Quick task-to-document routing for an agent working in this repo |
