# CLAUDE.md

**Mullion** — interactive multi-agent build platform: idea → capped MCQ
clarification → live architecture planning (diagram + decision log,
editable) → confirm → fork (export specs / automated build) → delivery
(archive + GitHub push).

Stack: Next.js · Hono (Node.js, not edge) · Better Auth · Neon/Drizzle ·
OpenRouter · Temporal Cloud · E2B · Redis Streams · S3 · OpenTelemetry ·
Turborepo.

## Read first
1. `docs/progress-tracker.md` — current phase, what's actually done
2. Routing table below
3. `docs/specs/04_design_decisions_log.md` — don't re-decide an existing ADR

## Docs
Numbered specs live in `docs/specs/`; routing shorthand `01`–`05` below
means those files.
| Doc | For |
|---|---|
| `docs/specs/00_project_overview.md` | Plain-language what/why — the front door for a human, not routing |
| `docs/specs/01_product_ux_flow_spec.md` | User-facing behavior, the four phases |
| `docs/specs/02_system_architecture_spec.md` | Implementation reference — services, schemas, agents |
| `docs/specs/03_future_improvements_v2.md` | Deliberately deferred — don't build early |
| `docs/specs/04_design_decisions_log.md` | ADR history — why it's like this |
| `docs/specs/05_build_plan.md` | Five phases + ADR-to-phase coverage table |
| `docs/CODING_STANDARDS.md` | Code conventions |
| `docs/progress-tracker.md` | Execution log |

## Routing
| Task | Section |
|---|---|
| Idea intake, MCQ clarification | `01` §2–3 · `02` §2.1–2.2 |
| Live diagram/decision log, edit prompts | `01` §4 · `02` §2.1, §2.3, §2.5 |
| Confirm/freeze, Fork A export | `01` §4.4–6 · `02` §2.5 |
| Sandbox execution | `02` §6 |
| Orchestrator, build state machine, retries/escalation | `02` §3, §3.1, §7.2, §12 |
| Coder/Tester/Reviewer/DevOps | `02` §5 |
| LLM calls, model routing, cost | `02` §5.1, §9 |
| Auth, GitHub connection, delivery | `02` §8, §11 · `01` §7 |
| DB schema, concurrency limits | `02` §4, §4.4 |
| Rate limiting, CORS | `02` §7.1.1 |
| Frontend behavior | `01` (whole) · `02` §7.1 |
| Tests, eval suite | `02` §10 |
| "Should I build X?" | `03` first |
| "Was this decided already?" | `04` |
| "What's next?" | `05` |
| Any code | `CODING_STANDARDS.md` |

## Non-negotiables
- Free-text edits only in Phase 2 planning, never during build (ADR-02)
- All LLM calls through OpenRouter + role config — no hardcoded models, no direct provider SDKs (ADR-24/25)
- ZDR-only routing, confirmed (ADR-27) — `zdr: true` on every call; Claude is
  the only frontier family with 2 ZDR providers, so reasoning-tier fallback
  planning assumes it; don't relax without superseding the ADR
- Fallback is same model/different provider only, never a silent model swap (ADR-26)
- One active session + one active build per user, enforced in the DB (ADR-29)
- Escalation gates ≠ Phase 2 editing — keep visually/mechanically distinct (ADR-07)
- DevOps gets packaging + GitHub push only, no live-deploy creds in v1 (ADR-04/15)
- Partial/abandoned builds get identical delivery options to full success (ADR-33)
- Sign-in required before any session — no anonymous flows (ADR-35, reversed default)
- Multi-tenant via Better Auth organization plugin: non-null `org_id` on every
  tenant-scoped table, org-scoped queries + membership middleware; budgets
  per-org, GitHub tokens per-user, ADR-29 limits stay per-user (ADR-36)

## When done
Update `docs/progress-tracker.md`. Any new judgment call → new ADR in `04` first, not a
silent default. Don't build `03`'s deferred items early. Per
`CODING_STANDARDS.md` §11: install dependencies via the package manager's
command, never a hand-typed version; check official docs before coding
against an external library; run a security review at the end of every
phase and fix findings before moving on.
