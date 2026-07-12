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
| Phase 2 — Automated Build Pipeline | Done (live-cred verification deferred) | 2026-07-11 | M1–M4 built, verified, reviewed; phase-end security review passed (findings fixed). Fork B end-to-end. Real E2B/OpenRouter/Temporal-Cloud/GitHub-OAuth passes await creds |
| Phase 3 — Observability, Evaluation & Hardening | Done (live-cred verification deferred) | 2026-07-11 | All 6 deliverables built + verified; comprehensive 5-lens security audit passed (4 Med + 11 Low fixed). ZDR-live/OTLP-export/live-eval await creds |
| Phase 4 — Polish & Fast-Follow | Done | 2026-07-11 | Live agent-graph shipped; UX backlog swept (zero qualifying items); DoD + security review recorded in `docs/verification/phase4-dod.md`. v1 feature-complete pending only the cred-gated live passes |

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

### [2026-07-12] Dashboard visual pass: no focus rings, smoother motion, custom Select, slight radius
**Phase:** Post-Phase-4 follow-on (UI polish, `apps/dashboard` only — a
parallel pass covers `apps/web`)
**Type:** Progress update
**Summary:** Four user-directed visual changes to the signed-in product
surface. (1) Removed the global `:focus-visible` outline rule and every
component-level `focus:ring-*`/`focus-visible:ring-*` utility; every
interactive element now carries its own non-ring keyboard-focus
affordance instead (a border or background shift on `:focus-visible`,
mirroring that element's hover treatment) — extended beyond the
originally-named files to `ui/button.tsx`, `ui/tabs.tsx`,
`nav/mobile-nav.tsx`, `nav/account-menu.tsx` once it was clear those had
no focus style of their own and would otherwise go invisible-on-keyboard
once the global rule was gone. (2) Tuned `.transition-swift` 150ms→200ms
and proportionally lengthened the rail/drawer/dialog timings in
`globals.css`, keeping the existing easing curve and the rail/drawer's
deliberate asymmetric open/close mechanism intact. (3) Replaced the
native `<select>` (`ui/select.tsx`) with a hand-rolled ARIA listbox
(WAI-ARIA APG pattern, full keyboard nav, click-outside, enter/exit
animation matching the dialog's state-driven class-toggle mechanism) —
its one consumer, `settings/model-role-row.tsx`, was updated for the
new `(value: string) => void` `onChange` contract. (4) Added a slight,
consistent border radius (`rounded-md` on inputs/buttons/tags/small
elements, `rounded-lg` on cards/panels/dialogs/popovers) across
`ui/`, `planning/`, `settings/`, and app chrome, superseding the
restyle-pass-1 "square corners everywhere" rule; `design-context.md`
updated to document the override rather than left contradicting it.
**Files/areas touched:** `apps/dashboard/src/app/globals.css`;
`src/components/ui/{select,text-field,textarea,button,confirm-dialog,skeleton,avatar,tabs}.tsx`;
`src/components/planning/{question-round-card,edit-prompt-bar,idea-intake-form}.tsx`;
`src/components/nav/{app-sidebar,mobile-nav,account-menu}.tsx`;
`src/components/settings/{model-role-row,byok-key-card,stat-tile,analytics-section,profile-section,form-note}.tsx`;
`src/components/{settings-skeleton,dashboard-skeleton}.tsx`;
`src/app/page.tsx`; `apps/dashboard/design-context.md`
**Related ADR:** None — visual direction/motion/radius are explicitly
engineering-not-ADR territory per `CODING_STANDARDS.md` §9.
**Follow-ups:** Verified by full re-read of every changed file, not a
live build/typecheck run (no shell access in this session) — worth a
`pnpm --filter dashboard build`/typecheck pass before merge. Left
untouched, flagged for the planning/build restyle (passes 2–3): any
`components/planning/*`/`components/build/*` files outside the ones
listed above, and the Phase 2 React Flow diagram chrome
(`.mullion-flow` controls) — these may still rely solely on hover
states with no dedicated focus-visible affordance now that the global
outline rule is gone.

### [2026-07-12] Recovery flow unified: passwordless OTP sign-in de-advertised (ADR-68)
**Phase:** Phase 5
**Type:** Architecture change
**Summary:** Removed the standing "Email me a code instead" link and the
sign-in form's code steps; deleted the orphaned send/verify sign-in-OTP
client mutations. Forgot-password is now the single recovery door for
every account type via the stock request-password-reset → reset-password
flow, which (verified against Better Auth 1.6.23 source) provisions a
first credential for social-first accounts — the assumed recovery
dead-end never existed. Forget-password email copy neutralized to read
correctly for set-or-reset and to teach social-first users; forgot page
now auto-navigates to the code screen. The `/sign-in/email-otp` endpoint
and ADR-66 guard stay live-but-dormant (guard + tests kept). New
integration test locks the social-first recovery path end to end.
**Files/areas touched:** `apps/web/src/components/auth/*`,
`apps/web/src/hooks/use-auth-mutations.ts`,
`apps/api/src/modules/email/templates.ts`,
`apps/api/src/app.integration.test.ts`
**Related ADR:** New — added ADR-68 to `04` (supersedes ADR-66's
standing-link clause). Also ADR-69: hardening this surfaced a
GC-timing-dependent `Request.clone()` "unusable" race in better-auth's
credential routes (nondeterministic sign-up 500s); fixed with a clone
guard at the API composition root, active in prod and tests.
**Follow-ups:** None

### [2026-07-11] Auth surface completed: OTP verification/reset, Google + GitHub login, linking, avatars (ADR-65/66/67)
**Phase:** Post-Phase-4 follow-on (auth hardening)
**Type:** Progress update + Architecture change
**Summary:** Credential auth now requires OTP email verification
(`emailOTP` plugin: 6 digits, 5 min, 3 attempts, hashed at rest;
`requireEmailVerification` + `autoSignInAfterVerification`); password
reset is the same plugin's OTP flow; passwordless OTP sign-in is allowed
only for accounts with no credential password (empty password field is
the flag — guard in `otp-signin-guard.ts` on both send + sign-in routes),
with a session-gated `POST /api/account/set-password` so social-first
users can add one. Google is a login (`socialProviders.google`); GitHub
login runs on a second minimal-scope OAuth app via `genericOAuth`
(`github-login`, reads /user/emails for a real emailVerified verdict) —
the repo-scoped delivery app stays link-only (ADR-56 guard intact,
integration-tested to not catch Google). Account linking: implicit for
verified same-email identities, `trustedProviders: []`,
`allowDifferentEmails: true` for the delivery link. Avatar reuses the
core `image` column via Better Auth `update-user`, pinned to https URLs
≤2048 chars by a `user.update.before` hook. Email goes through one
`sendEmail` seam: `EMAIL_DRIVER=console` logs the OTP locally (also how
the integration harness reads codes), `resend` in production (boot-fails
otherwise). OTP endpoints ride the 10/min/IP credential window. Data-only
migration 0007 grandfathers pre-launch users to `email_verified=true`.
Verified: config 11/11 unit, api 22/22 unit, 42/42 integration against
local Postgres (signup→OTP→verify→sign-in, wrong/expired OTP, reset +
old-password revocation, enumeration-identical reset responses, OTP
sign-in 403 for password holders, set-password 409, avatar https-only,
OTP flood 429); `db:generate` emits no schema drift.
**Files/areas touched:** `apps/api/src/modules/auth/` (auth.ts,
otp-signin-guard.ts, routes.ts), `apps/api/src/modules/email/` (new),
`apps/api/src/app.ts`, `packages/config/src/env.ts`,
`packages/db/drizzle/0007_backfill-email-verified.sql`,
`apps/api/src/app.integration.test.ts` (harness now OTP-verifies),
`apps/web` + `apps/dashboard` auth pages/settings, `.env.example`
**Related ADR:** New — added ADR-65/66/67 to `04` (login providers; OTP +
linking + avatar policy; email driver)
**Follow-ups:** register the Google + second GitHub OAuth apps and Resend
domain before prod deploy; branded email templates deferred (`03`);
shared auth-client extraction still pending (deliberate per ADR-64).
Multi-lens review (correctness/security/tests/blast-radius) ran post-build;
fixed from findings: `revokeSessionsOnPasswordReset` + `sendOnSignIn` were
missing (reset now really logs out everywhere, blocked sign-in really
re-sends the OTP — both integration-tested), per-email OTP send cap
(6/hour, in-memory like the rate-limit store), fail-closed GitHub
/user/emails fetch, OTP autofill handling, harness de-flaking + 3 new
integration tests (passwordless OTP sign-in happy path, allowedAttempts
cap, session revocation). Accepted risks / deferred: the 403
"has a password" auth-method oracle is an owner-chosen UX tradeoff;
unverified-email squatting is a DoS-only path (needs an unverified-account
sweep, `03` territory); set-password check→write is non-atomic (benign —
add a partial unique index on account(userId) WHERE providerId='credential'
with the next real schema migration); NODE_ENV remains the single switch
for the prod env guards.

### [2026-07-11] Dashboard restyled to the brand (dark hybrid)
**Phase:** Post-Phase-4 follow-on (marketing/product separation)
**Type:** Progress update
**Summary:** apps/dashboard brought onto the marketing brand as a dark
hybrid: base darks shifted to the brand inks (#08080d/#10101a), the
accent family repointed from amber to ember (#c4552a/#d96b3d), gilt
eyebrows/tags, hairline structural rules, Cormorant serif headings +
JetBrains Mono uppercase labels, square corners throughout. Functional
colors (danger/success/diagram node hues) and all motion (single brand
curve, flash-once/pulse-glow exceptions) kept. Three className-only
passes: foundation (tokens, ui primitives, header, home, 404, new
apps/dashboard/design-context.md), planning surface (17 components +
session page chrome; MCQ option cards, editorial fork-choice cards,
hairline decision log), build surface (13 files; editorial run header,
squared status tags, hairline timeline spine, escalation gate kept
visually distinct per ADR-07). Zero logic/prop/aria changes verified by
diff audit; full DoD green. Also: landing nav scrolled state is now a
detached floating bar (20% narrower, blurred cream glass, one-curve
morph) — committed separately.
**Files/areas touched:** apps/dashboard/src (globals.css, ui/*,
components/*, app pages), apps/dashboard/design-context.md,
apps/web/src/components/landing/landing-nav.tsx
**Related ADR:** ADR-64 (the split this restyle was staged behind)
**Follow-ups:**
- Visual smoke pass in a browser (three dev ports) for the restyled
  flows; static checks are green but nobody has eyeballed live SSE
  surfaces yet.

### [2026-07-11] App split: dashboard moved to its own Next.js app (ADR-64)
**Phase:** Post-Phase-4 follow-on (marketing/product separation)
**Type:** Architecture change
**Summary:** apps/web split in two. apps/web keeps marketing + auth
(landing, /pricing, /sign-in, /sign-up) on the root domain; new
apps/dashboard owns the signed-in product at its root (`/`,
`/sessions/[id]`, `/builds`, `/builds/[id]`) on the app. subdomain in
prod, :3001 in dev. Auth stays centralized on the Hono API — the session
cookie lives on API_ORIGIN only (host-only, Lax); no crossSubDomainCookies.
Both frontends are credentialed cross-origin API clients, so the API's
three origin allowlists (CORS, CSRF gate, trustedOrigins) now accept
{WEB_ORIGIN, DASHBOARD_ORIGIN}; DASHBOARD_ORIGIN is validated in
packages/config (https-only in prod, integration + unit tested). Redirect
flow: unauthenticated dashboard visit → web /sign-in?returnTo=<deep link>
(auth-redirect.ts, latched); sign-in/up success or already-authed visit to
an auth page → validated hand-off to the dashboard (return-to.ts,
origin-exact open-redirect guard, 9 unit tests); sign-out → marketing
root; legacy /dashboard, /builds/*, /sessions/* paths on web redirect to
the dashboard app via next.config. All cross-app URLs are env-driven
(NEXT_PUBLIC_DASHBOARD_URL on web, NEXT_PUBLIC_WEB_URL on dashboard) — no
hardcoded domains, dev and prod use the same code. Client glue (auth
client, api wrapper, ui primitives, providers, CSP proxy, globals.css)
was copied, not extracted to a package — the dashboard restyle follow-up
deliberately diverges the two aesthetics. Dead code swept on both sides:
web dropped build/planning components, product hooks/libs, xyflow/dagre/
react-icons/schemas/zod deps and orphaned ui primitives; dashboard
dropped the auth-form primitives and radix/cva/lucide deps it doesn't
use. `pnpm build && pnpm check-types && pnpm lint && pnpm test` green
across all workspaces.
**Files/areas touched:** apps/dashboard (new), apps/web (marketing-only
trim + hand-off), apps/api/src/app.ts + modules/auth/auth.ts (origin
allowlists), packages/config (DASHBOARD_ORIGIN), .env.example files,
apps/*/README.md
**Related ADR:** New — added ADR-64 to `04` (two-frontend topology,
cookie-on-API-origin, one-eTLD+1 prod requirement)
**Follow-ups:**
- Dashboard UI restyle to the landing aesthetic (dark hybrid: marketing
  typography + ember/gilt accents on the dark product base) — next task.
- Prod deploy must keep all three origins under one registrable domain
  (ADR-64 hard requirement); resolves the Phase 0 "prod cookie topology"
  open item via same-site subdomains.
- Add DASHBOARD_ORIGIN to any existing local apps/api/.env files.

### [2026-07-11] Marketing surface: brand logo, /pricing page, global 404
**Phase:** Post-Phase 4 maintenance
**Type:** Progress update
**Summary:** Follow-on to the landing revamp. Owner-generated cube logomark
(gold wireframe half becoming solid ultramarine) now renders through
`MullionMark` everywhere and as the favicon (`src/app/icon.png`). New
`/pricing` page in the (marketing) group: header band, reused tier cards,
feature comparison table (placeholder rows, owner edits), billing FAQ on a
dark band. Global `not-found.tsx` styled as part of the marketing world
("This page was never built." with the unbuilt-tower artwork). Final CTA
became a split layout with new torchbearer artwork. Lenis smooth scrolling
added to the marketing surface (reduced-motion users get native scroll).
`Faq` gained items/tone props, `Pricing` a hideHeader prop; nav/footer
anchors carry a leading slash so they resolve from any page.
**Files/areas touched:** `apps/web/src/app/(marketing)/pricing/`,
`apps/web/src/app/not-found.tsx`, `apps/web/src/components/landing/`,
`apps/web/src/components/mullion-mark.tsx`, `apps/web/src/app/icon.png`,
`apps/web/public/{logo,logo-mark,cta-torchbearer}.*`
**Related ADR:** None — marketing surface only
**Follow-ups:** pricing tiers, comparison rows, and billing FAQ answers are
placeholders pending real pricing decisions.

### [2026-07-11] Marketing landing page revamp (editorial redesign)
**Phase:** Post-Phase 4 maintenance
**Type:** Progress update
**Summary:** Replaced the placeholder landing page with a full editorial
marketing page (cream/ultramarine/ember palette keyed to generated artwork
in `apps/web/public/*.png`; Fraunces serif added alongside Archivo +
JetBrains Mono). Sections: floating nav (transparent → translucent cream
on scroll), full-viewport hero with right-bleed artwork, four numbered
chapter bands (manifesto, how-it-works, agent crew, control), three-tier
pricing band (placeholder prices/features, owner will edit copy), FAQ
accordion, closing CTA, footer. App routes restructured into route groups:
`(marketing)` for the landing with its own chrome, `(app)` for the
signed-in surface keeping `SiteHeader`; moved pages' relative imports
rewritten to the `@/` alias. Motion follows the design-motion skill
(Jakub-weighted): IntersectionObserver scroll reveals via state-driven
transitions (opacity/translate/blur, custom cubic-bezier), grid-rows FAQ
accordion, no loops/parallax, `prefers-reduced-motion` collapses all.
Verified with production build + headless-Chromium screenshots of every
band at 1440/1600/390 widths.
**Files/areas touched:** `apps/web/src/app/(marketing)/` (new),
`apps/web/src/app/(app)/` (moved builds/dashboard/sessions/sign-in/sign-up),
`apps/web/src/components/landing/` (new; one component per section:
landing-nav, hero, manifesto, how-it-works, crew, control, pricing,
faq-section, final-cta, landing-footer + shared chapter-mark, reveal, faq),
`apps/web/src/app/{layout.tsx,globals.css}`, `apps/web/public/*.webp`
(artwork converted from PNG, ~15MB → ~590KB total); deleted old
`page.tsx`, `mullion-grid.tsx`, `hero-actions.tsx`
**Related ADR:** None — visual/marketing surface only; no product behavior
changed
**Follow-ups:** pricing tiers/features are placeholders pending real
pricing; mobile nav intentionally has no hamburger (center links hide
below md, CTA remains) — owner confirmed.

### [2026-07-11] Shared structured logging via new packages/logger (ADR-63)
**Phase:** Post-Phase 4 maintenance
**Type:** Architecture change
**Summary:** Replaced all ad-hoc `console.*` logging with a shared
pino-based structured logger. New `@mullion/logger` (depends only on
`@opentelemetry/api` — no cycle with `@mullion/otel`) stamps
`trace_id`/`span_id` on every line via a mixin reading the active span,
redacts secret-bearing paths, and serializes errors to
type/message/stack only (an Octokit error's embedded auth header can't
leak). `LOG_LEVEL`/`LOG_FORMAT` added to the validated env schema
(pretty in development, JSON elsewhere). `startOtel()` now registers an
exporterless tracer provider + context manager even without an OTLP
endpoint so trace correlation works in local dev. `hono/logger` replaced
by a structured request-completion middleware after `tracingMiddleware`;
orchestrator activities take an injected `log` dep with run-scoped
bindings (`run_id`/`org_id`/`task_id`); Temporal workflow code stays
logger-free (zero-IO isolate). LLM prompt/completion bodies are never
logged (metadata only) — stdout sits outside the ZDR guarantee.
**Files/areas touched:** `packages/logger/` (new), `packages/otel/src/start.ts`,
`packages/config/src/env.ts`, `apps/api/src/{index,worker,app}.ts`,
`apps/api/src/middleware/request-log.ts` (new), `apps/api/src/lib/sse.ts`,
`packages/orchestrator/src/activities.ts`, `docs/CODING_STANDARDS.md` §12
**Related ADR:** New — added ADR-63 to `04`
**Follow-ups:** OTLP logs export + log shipping deferred (03 territory);
audit-log product feature stays a Postgres concern, not log lines.

### [2026-07-11] apps/api restructured to module-based layout (ADR-62)
**Phase:** Post-Phase 4 maintenance
**Type:** Architecture change (code organization only, no behavior change)
**Summary:** Owner directive: module-based folders in apps/api. `src/` now
holds `config/` (env), `lib/` (db, llm, llm-fetch, sse, temporal),
`middleware/`, and `modules/{auth,planning,builds,github,dev}`, with each
module owning its `routes.ts` next to its domain logic and tests. Only
`index.ts`, `worker.ts`, and `app.ts` stay at the root. All imports
rewritten; `check-types` and the unit suite pass. File pointers in earlier
ADRs/tracker entries are historical and left unchanged.
**Files/areas touched:** apps/api/src (27 files moved), apps/api/README.md
**Related ADR:** New — ADR-62
**Follow-ups:** None.

### [2026-07-11] Evals CI no longer commits to main (ADR-61)
**Phase:** Post-Phase 4 maintenance
**Type:** Architecture change (process)
**Summary:** Owner directive: no more `mullion-evals[bot]` commits. The
evals workflow's "persist history on main" step is removed; each run now
publishes its trend (committed history + the current run) to the workflow
job summary and the existing per-run artifact, and the job token drops to
`contents: read`. `docs/evals/history.jsonl`/`trend.md` remain in the repo
frozen at their last bot-written state; new records are appended only by a
deliberate human-run CLI + commit at meaningful model/prompt/policy
changes.
**Files/areas touched:** .github/workflows/evals.yml, docs/specs/{04,05}
**Related ADR:** New — ADR-61 (amends ADR-60's history-commit mechanism;
suite/modes/metrics unchanged)
**Follow-ups:** None — first live-mode baseline (pending OPENROUTER_API_KEY)
should be recorded via the human-curated path.

### [2026-07-11] Phase 4 — Live agent-graph, backlog sweep, DoD verified (v1 feature-complete)
**Phase:** Phase 4 — Polish & Fast-Follow (whole phase)
**Type:** Progress update
**Summary:** Phase 4 executed and closed in one pass, per its mandate of
zero new decisions. (1) The live agent-graph visualization for the build
phase (M5's deferred fast-follow, commit `cb42843`): task-dependency DAG
via React Flow + the existing dagre `layoutGraph`, one node per task
(spec-id chip, truncated description, status pill, attempt), live status
treatment (running pulses via a new `pulse-glow` keyframe with a
reduced-motion static-ring fallback; verified/failed/pending toned via the
existing status palette), edges animated into running targets, and an
ADR-07-compliant escalation override (danger fill + "Needs decision",
suppressing the routine running-pulse) on the node matching the active
gate's specTaskId. Wired into the build dashboard as a List/Graph toggle
inside the tasks pane — both views stay mounted so pan/zoom and
expanded-row state survive switching; data flow untouched (TanStack Query
remains source of truth; no changes to use-build-run.ts). Pre-commit
review ran as two parallel sage shards (correctness/data-flow;
UX/ADR/a11y): no Critical/High; fixed before commit: aria-pressed on the
new toggle AND the pre-existing mobile tab row, pending-node contrast
(opacity 60→75 for WCAG AA), dependency-edge dedupe, status-stripe map
typed `Record<status,…>` so a new enum member fails at the definition
site. (2) UX-refinement backlog sweep: zero qualifying items — every open
follow-up is architecture-gated (ADR-53 Option A), cred-gated
(edit-answers `affects` filtering, live-model passes), or a behavior
change (LLM commit messages), all excluded by the no-new-decisions
mandate. (3) DoD recorded in `docs/verification/phase4-dod.md`: Doc 2 §15
criteria mapped to standing evidence (M3 crash-resume, M4 full pipeline +
escalation signals, eval suite, ADR-11 replay, ADR-38 SSE guarantees);
build-plan §6 master table's stale pre-execution 🔧 markers flipped to ✅
on Phase 3 D4's 60/60 cross-check evidence (ADR-09/10 annotated
creds-gated); dedicated phase-end security review of the touched surface
PASSED with zero findings (XSS/DoS/exposure/CSP/deps — full verdict in
the DoD doc). Full DoD gates green (`check-types`+`lint`+`build`+`test`,
24 turbo tasks).
**Files/areas touched:** apps/web (new: components/build/{build-agent-graph,
build-task-node-card}.tsx, lib/build-graph-{mapping,flow-types}.ts; edited:
app/builds/[id]/page.tsx, app/globals.css), docs/specs/05 (§6 table),
docs/verification/phase4-dod.md (new)
**Related ADR:** None new — implements ADR-07 at the graph layer; Phase 4
mandate (no new decisions) held: reviews confirmed nothing ADR-worthy
smuggled in
**Follow-ups:** v1 is feature-complete against Docs 01–04. Remaining open
items are unchanged and externally gated: the live-cred verification
passes (OpenRouter key, E2B parity, Temporal Cloud, GitHub OAuth), the two
trigger-gated audit deferrals (symlink realpath on mounts/envs; ADR-31
budget TOCTOU), and the architecture-gated fast-follows (ADR-53 Option A
hydrate; frontend test harness; LLM commit messages) — each fires on its
documented trigger, none block v1.

### [2026-07-11] Phase 3 D6 — Comprehensive phase-end security audit (PASSED)
**Phase:** Phase 3 — Observability, Evaluation & Hardening (phase gate)
**Type:** Progress update
**Summary:** The comprehensive cross-service audit the Phase 0–2 reviews
built toward — 5 parallel lenses (auth/tenancy/API; LLM/injection/cost;
sandbox/orchestrator/delivery; secrets/config/CI/otel; web frontend) over
the entire standing surface, each demanding file:line evidence + an exploit
scenario. Full report: `docs/verification/phase3-security-audit.md`. No
Critical, no High. 4 Medium + 11 Low, ALL fixed in this pass: build-SSE
membership recheck; GitHub OAuth token encryption at rest
(encryptOAuthTokens); non-streaming LLM body size cap; crash-idempotent
GitHub delivery (422-resume, +2 regression tests); frontend CSP +
frame-ancestors + security headers (verified live); negative-cost budget
floor; coder maxTokens; scoped CLI reaper; reviewer prompt cap; wider
repoName entropy; SHA-pinned GitHub Actions + dependabot; prod guards for
OPENROUTER_BASE_URL / DATABASE_URL-TLS / CI permissions; malformed-Referer
500 fix; delivery-link host allowlist; credential-endpoint rate limit;
clipboard catch. 6 items deferred with explicit triggers (symlink realpath
gate, escalation-target tagging, artifact GC, signin-guard test harness,
budget TOCTOU, full script-src CSP). DoD green incl. gated Temporal (34) +
sandbox egress (13) integration suites.
**Files/areas touched:** apps/api (auth, index, middleware, routes, dev),
apps/web (next.config, delivery panel), packages/{llm,agents,orchestrator,
delivery,config,schemas}, .github/{workflows,dependabot}, docs/verification
**Related ADR:** None new — hardening within existing ADRs; ADR-44
amendment already logged in D4
**Follow-ups:** the 6 deferred items above, each creds- or
harness-gated; Phase 3 complete → Phase 4 (polish, live agent-graph)
unblocked.

### [2026-07-11] M5 — Build-phase dashboard (structured timeline/log view)
**Phase:** Phase 2 milestone M5 (02 §14), built during Phase 3
**Type:** Progress update
**Summary:** The frontend for Fork B's build runs — deliberately the
structured timeline/log view called out in M5, not the richer live
agent-graph (that fast-follow is unchanged/still deferred). New
`apps/web/src/app/builds/page.tsx` (recent-runs list, GET /api/builds,
empty state pointing at a confirmed planning session) and
`apps/web/src/app/builds/[id]/page.tsx` (run header with a per-state status
badge; task list with dependency chips tinted by the referenced task's live
status, expandable descriptions, turns/duration/cost and failure reason
once a task's persisted `TaskResult` parses; chronological event timeline
of every stream event, auto-scroll-pinned like the Phase 2 decision log;
delivery panel — copyable `artifact://` refs, linked GitHub refs, identical
treatment for a partial delivery per ADR-33). Escalation gate
(ADR-07/ADR-55) built as a top-of-page interruption banner —
danger-toned, "action needed" framing — deliberately NOT styled like Phase
2's EditPromptBar, with approve/redirect(≤4000 chars, scoped-to-task)/
abandon wired to POST /api/builds/:id/escalate; a 409 (gate expired/already
resolved) dismisses and resyncs rather than leaving a dead banner. All data
fetching via TanStack Query per the owner's directive; the SSE connection
(EventSource, full replay via `?lastEventId=0` since there's no REST
snapshot to hydrate a timeline from first) lives in a `useEffect` that
feeds a local reducer (timeline/escalation state) plus targeted
`queryClient` cache updates/invalidations — never bypassing Query as the
source of truth for run/task data. Three SSE payload shapes without an
existing schema (`phase`, `escalation_required`, `delivery_result`) got
local zod schemas in `apps/web/src/lib/build-stream.ts` (reusing
`buildStreamTaskEventSchema`/`buildReviewVerdictSchema`/`taskResultSchema`
from `@mullion/schemas` everywhere they already existed, per CODING_STANDARDS
§8, rather than re-defining them). Fork B wired end to end: fork-choice-cards'
"Build it for us" now POSTs `/api/builds` and routes to the new dashboard on
any 2xx outcome (created/resumed/ambiguous-queued all carry a real run id);
this required threading `buildSpecId` through
`sessions/[id]/page.tsx` → `ConfirmedView` → `ForkChoiceCards`, which hadn't
been passed down before. Added a `Builds` link to the persistent site header
and one new palette token pair (`--color-success`/`-strong`/`-soft`) for a
"done" tone distinct from the existing accent/danger pair, same low-chroma
warm-dark family as the existing node-kind hues.
**Files/areas touched:** apps/web (new: app/builds/{page.tsx,[id]/page.tsx},
components/build/* (8 files), lib/{build-stream.ts,build-timeline-reducer.ts,
build-format.ts}, hooks/use-build-run.ts; edited:
components/planning/{fork-choice-cards.tsx,confirmed-view.tsx},
app/sessions/[id]/page.tsx, components/site-header.tsx, app/globals.css)
**Related ADR:** None new — implements ADR-07 (escalation-gate distinctness)
and ADR-33 (partial delivery parity) at the UI layer; verifies ADR-55's
escalate endpoint contract end to end from the client for the first time
**Follow-ups:**
- Not yet run live against a real build (needs OPENROUTER_API_KEY/E2B/
  Temporal creds per existing follow-ups) — built and reviewed against the
  documented API contract, not yet click-tested against a real SSE stream.
- No apps/web component/route tests exist yet for this surface (matches the
  rest of apps/web — Phase 3's route-test-harness follow-up is apps/api-side
  so far; a frontend equivalent is still open).
- The richer live agent-graph visualization for the build phase (M5's
  explicitly-deferred fast-follow, distinct from Phase 2's already-live
  architecture diagram) is still pending, by design.

### [2026-07-11] Phase 3 D4 — Verification pass (egress, ZDR, auth, ADR cross-check, EXPLAIN)
**Phase:** Phase 3 — Observability, Evaluation & Hardening
**Type:** Progress update + Gap found (docs)
**Summary:** The genuine verification pass, full report in
`docs/verification/phase3-verification.md`. (1) Egress: new driver-
parameterized integration suite actively attempts DNS / direct-IP TCP /
HTTPS / host-loopback from inside a sandbox — 4/4 blocked live against the
local driver; it doubles as the E2B parity test select.ts requires. (2)
ZDR (ADR-27): live half implemented as `verify-zdr-cli.ts` (endpoint
ZDR-eligibility × actually-serving provider via generation API); runs the
day a key lands. (3) Better Auth: live cookie inspection (HttpOnly,
SameSite=Lax, 7d, signed) + config review; added production boot-guard
requiring https origins (Secure-cookie precondition). (4) ADR cross-check
via 3 parallel evidence-demanding reviews: 60/60 implemented, zero
paper-only ADRs; fixed found doc gaps (ADR-44 amendment, build plan §0
stale range, §6 table extended through ADR-60). (5) Deferred EXPLAIN pass
done at 100k rows: SSE poll 0.16–0.65ms index-driven both distributions;
auth lookups 0.02–0.03ms. DoD green.
**Files/areas touched:** packages/sandbox (egress test), apps/api
(verify-zdr-cli), packages/config (https boot-guard), docs/specs/04+05,
docs/verification (new)
**Related ADR:** ADR-27/44/47 (verifies); amendment to ADR-44
**Follow-ups:** the 5 credential-gated items tabled at the end of the
verification report — each has a ready harness.

### [2026-07-11] Phase 3 D3 — Fixed eval suite + CI trend line (ADR-12)
**Phase:** Phase 3 — Observability, Evaluation & Hardening
**Type:** Progress update
**Summary:** New `packages/evals`: 16 fixed tasks (difficulty 1–5; two-
and three-node dependency chains; a designed verify→fix cycle; a designed
retry-exhaustion escalation) run by a direct-drive harness through the real
buildTask loop, real Docker sandboxes, the real RETRY_BUDGET/dispositionFor
policy, and real DB persistence under a dedicated eval org. Modes:
scripted (CI baseline, expectation-checked), live, replay (ADR-11
cassettes). Metrics per ADR-12: pass rate, retries, escalations,
cost/task — appended per run to `docs/evals/history.jsonl`, rendered to
`docs/evals/trend.md`. First recorded run: 15/16 pass, 2 retries,
1 escalation (both from the designed-failure fixtures), $0.044 modeled
cost, 43 turns. CI created (none existed): `ci.yml` (types/lint/build/test
+ gated Temporal integration job) and `evals.yml` (main-push scripted run
against a Postgres service, history committed back, live mode via manual
dispatch once a key secret exists). 9 new unit tests freeze the suite's
shape. Full DoD green.
**Files/areas touched:** packages/evals (new), .github/workflows (new),
docs/evals (new)
**Related ADR:** ADR-12 (implements); New — added ADR-60 to `04`
**Follow-ups:** record live-mode baseline once OPENROUTER_API_KEY exists
(repo secret + local); Fork-A planning-phase eval deferred until then
(fixtures already carry `idea`); GH workflows unverified against a real
runner until first push to a GitHub remote.

### [2026-07-11] Phase 3 D1 — OpenTelemetry tracing end to end, both services
**Phase:** Phase 3 — Observability, Evaluation & Hardening
**Type:** Progress update
**Summary:** 02 §9 tracing built: new `packages/otel` (no-op unless
`OTEL_EXPORTER_OTLP_ENDPOINT` set; dynamic-imported NodeSDK + undici
instrumentation; `withSpan`/`currentTraceId` helpers). One trace spans the
whole path: Hono middleware (traceparent extract, route-pattern span names)
→ Temporal workflow-client interceptor → bundled workflow interceptor →
activity interceptors → `llm.*` spans on all three OpenRouterClient methods
(role, served model, generation id, tokens, cost) → `tool.*` spans on every
coder tool invocation (writeFile/readFile/runCommand/verify, with exit
codes). Workflow-sandbox spans exit via Temporal's exporter sink. Pinned to
OTel 1.x line (Temporal interceptor compatibility — see ADR-59); resolving
that surfaced and fixed a pnpm dual-instance drizzle-orm type split.
Verified: 5 new tests (span helpers, LLM span attributes, error status) +
gated integration test proving the worker bundles the workflow interceptor
module; API smoke-booted with tracing middleware live; full DoD green
(197 tests).
**Files/areas touched:** packages/otel (new), packages/llm (client spans),
packages/agents (tool spans), packages/orchestrator (worker interceptors +
sink), apps/api (index, worker, temporal, middleware/tracing)
**Related ADR:** New — added ADR-59 to `04`
**Follow-ups:** live OTLP export against a real collector still unverified
(no collector locally) — fold into D4's verification pass if one is
available, else note as pending-creds like other live integrations;
stream_events trace-id stamping deliberately skipped (ADR-59).

### [2026-07-11] Phase 3 D2 — LLM record/replay cache (ADR-11) operational
**Phase:** Phase 3 — Observability, Evaluation & Hardening
**Type:** Progress update
**Summary:** ADR-11's record/replay cache built as a fetch-wrapper injected
into `OpenRouterClient` — cassettes keyed by request-body hash, storing
served model/provider/generation-id alongside the pinned slug, API key never
persisted. `LLM_REPLAY_MODE=off|record|replay` + `LLM_CASSETTE_DIR` env
config (production locked to `off` at boot); wired into both the API process
and the build worker via a shared `llm-fetch.ts`, so both record into and
replay from one cassette dir. Replay miss = typed hard error, never a silent
live call. Streams record (buffered) and replay through
`completeChatStream` unchanged; failure responses aren't recorded. 6 new
unit tests; full DoD green. Worker's `OPENROUTER_BASE_URL` wiring also
gained the missing `NODE_ENV !== "production"` guard the API process
already had.
**Files/areas touched:** packages/llm (replay.ts, errors, index, tests),
packages/config (env schema), apps/api (llm.ts, llm-fetch.ts, worker.ts),
.gitignore
**Related ADR:** ADR-11 (implements); New — added ADR-58 to `04`
(fetch-boundary + hard-fail-miss judgment calls)
**Follow-ups:** D3's eval suite can replay recorded cassettes in CI once a
real key records them; build-task CLI could grow a convenience flag to
record a full build's cassettes in one pass.

### [2026-07-11] Phase 2 phase-end security review — passed, findings fixed
**Phase:** Phase 2 — Automated Build Pipeline (phase gate)
**Type:** Progress update
**Summary:** Phase-end security review per CODING_STANDARDS §11 + the build-plan
Phase-2 DoD (sandbox escape/egress, GitHub token scope = repo, generated code
never executed outside the sandbox), run as two parallel sage shards
(execution-isolation; secrets/tenancy/injection). NO Critical, NO cross-tenant
break, NO host-execution path. Verified clean: generated code only ever runs
inside the container (all four tools + both verifiers + snapshot route through
the boundary; no child_process/fs reachable); local Docker egress genuinely
blocked (real fetch-fails test); GitHub token per-owner, repo-scoped, absent
from every user-visible artifact (deliveries.ref, MULLION_BUILD.md,
decision_log, SSE, summary); escalate/redirect owner-only + org-scoped +
state-guarded + zod-capped, blast-contained to one task, cannot alter the
verify command; the dollar budget is cumulative across redirects (redirect
resets only the retry budget); ZDR + no-model-slug-outside-routing intact on
the new coder/tester/reviewer calls; every Phase-2 query org-scoped; auth/CSRF/
rate-limit ordering correct on all new routes.
Findings FIXED before sign-off: E2B driver now REFUSES selection until its
network/resource isolation reaches parity with the local driver + an egress
parity-test exists (was silently weaker — the Coder prompt claims "no network";
inert today with no key, but a phase-gate seam); boot-time + periodic GLOBAL
stale-container sweeper (the per-run reaper only fired on a same-run retry, so a
SIGKILLed/abandoned run leaked its `sleep infinity` container); per-run
50MB artifact-snapshot byte budget (host disk was unbounded); readFile now
REFUSES a file over the capture cap instead of silently truncating it (was
corrupting the verify-copy + delivered repo); GitHub OAuth scope pinned
`["repo"]` SERVER-SIDE (was client-decided); path guards aligned (collapse
in-tree `..` instead of dropping legit files; backslash normalized both sides);
delivery-failure logging trimmed to message/status (not the full error object
around a credential-bearing client). New tests: reapStaleContainers, the
artifact collapse behavior, the e2b-refusal.
**Files/areas touched:** packages/{sandbox (select/docker-sandbox/port),
artifacts (port), orchestrator (activities)}, apps/api (auth, worker)
**Related ADR:** None new — hardening within ADR-44/47/53/56 scope
**Follow-ups (hardening backlog, not blockers):**
- E2B network/resource-isolation parity + an egress parity-test, before the
  refusal in select.ts is lifted (rides the real-E2B-creds pass).
- Two Better-Auth sign-in-guard INTEGRATION tests (raw POST /sign-in/social
  {github}→403; a GitHub callback with no session mints no user) — needs the
  apps/api HTTP/auth test harness that doesn't exist yet (shared Phase-3 item).
- Verify the apps/web renderer escapes decision_log/review_result text
  (stored-XSS surface via reviewer notes on model-influenced code) — React
  default-escapes, so likely fine; confirm no dangerouslySetInnerHTML at the
  render site (M5 UI work).
- Artifact store keyed by runId only (org-verified UUID) — add organizationId
  to the store key as defense-in-depth when convenient.

### [2026-07-11] Phase 2 M4 — Full team, delivery, escalation, GitHub (Fork B end-to-end)
**Phase:** Phase 2 — Automated Build Pipeline (milestone M4, final build milestone)
**Type:** Progress update
**Summary:** Final build milestone: Reviewer + DevOps, escalation gates, and
GitHub delivery — Fork B end to end. The real spine was the PERSISTENCE GAP:
M1–M3 dispose each sandbox, so no durable repo existed. New
`packages/artifacts` (ArtifactStore port: LocalFsArtifactStore substrate + S3
stub + InMemory fake, ADR-53); `runTaskActivity` snapshots each task's
writeFile-tracked files (`TaskResult.producedPaths`) into the store before
dispose, regardless of pass/fail (partial files ship too, ADR-33). Reviewer:
`buildReviewerAgent` one-shot (clone of the consistency reviewer) run in a new
`reviewing` phase over the produced tree + acceptance criteria + decision log;
advisory — verdict recorded to decision_log + streamed, blocker flags the
summary, no auto-fix loop (ADR-54). DevOps/delivery: new `packages/delivery`
(DeliveryTarget port — ArchiveDeliveryTarget via jszip + GitHubDeliveryTarget
via Octokit create-repo→blobs→tree→commit→ref + local fakes) in a `shipping`
phase reached on EVERY terminal path with a "what's built/missing" summary
(ADR-33 non-gated delivery; the workflow now collects per-task outcomes,
skips dependents of abandoned tasks, and ships partial). Escalation gate WIRED
(ADR-55): on budget exhaustion the workflow condition()-waits (30-min timeout →
abandon) for an approve/abandon/redirect signal; redirect re-runs the task with
an operator instruction (the one sanctioned free-text-during-build, reconciled
with ADR-02), budget-reset once, capped at 2. POST /api/builds/:id/escalate
signals it. GitHub (ADR-56): Better Auth `socialProviders.github` gated on a
soft-optional OAuth app + a `hooks.before` that HARD-BLOCKS GitHub as a sign-in
method (link-only), per-user repo-scoped token read only at delivery,
GET /api/github/connection. No Redis (ADR-57): Temporal dispatch + messages/
stream_events ARE the bus. Migration 0006 adds the `deliveries` table.
**Verified:** full DoD green (`check-types`+`lint`+`build`+`test`, 156 unit
tests across artifacts/delivery/reviewer/orchestrator/etc.) plus the
orchestrator integration tier (28 tests): the M4 flow (building→reviewing→
shipping→done), the escalation gate exercised with REAL human signals
(approve→continue, abandon→skip-deps, redirect→re-run-and-verify) against a
real Temporal server, ADR-33 partial-build delivery, crash-resume (still
green), and the full-pipeline (real Docker + buildTask → review → ship).
**Files/areas touched:** packages/{artifacts (new),delivery (new),agents
(reviewer),schemas (reviewer/producedPaths),orchestrator (workflows/activities/
types),db (deliveries + migration 0006),config}, apps/api (auth, github/,
routes/{builds escalate, github},worker), docs/specs/{04,05}
**Related ADR:** New — ADR-53 (ArtifactStore + union workspace), ADR-54
(advisory Reviewer + delivery, non-gated), ADR-55 (escalation wired + redirect
reconciles ADR-02), ADR-56 (GitHub link-only), ADR-57 (no Redis); `05` table
extended 53–57
**Follow-ups:**
- Workspace is union-only (Option B); snapshot+HYDRATE for genuinely dependent
  multi-file task builds is the immediate fast-follow (ADR-53 Option A) — needs
  threading base files into the M2 verify sandbox.
- Reviewer is advisory; the automated `fixing` loop (reviewer reject → re-run)
  is deferred (§12 infinite-negotiation risk) — wire behind the escalation gate.
- DevOps commit message is static; a fast-tier LLM commit/README message is a
  fast-follow.
- GitHub push + real linkSocial only run against the local fake so far (no OAuth
  app); a real-creds pass rides the existing cred follow-ups. Archive delivery is
  fully real (jszip).
- Live full-stack smoke (API + worker + temporal start-dev + Docker + a linked
  GitHub) needs the running processes, like planning needs the OpenRouter mock.
- Route-test harness for apps/api (POST /api/builds, /escalate, /github) is still
  the Phase-3 hardening item (no HTTP/auth test harness exists yet).
- Multi-lens review (3 High, 2+ Medium, Lows + test gaps) run and FIXED before
  commit: the escalation route POST /api/builds/:id/escalate was CLAIMED but
  MISSING — now added (owner-only, state-guarded, zod-capped redirect, signals
  the workflow); delivery zip stored under a sibling key so a ship retry can't
  zip-in-zip / commit the blob into the repo; shipActivity per-target try/catch +
  idempotent (skip already-delivered kind) + always emits delivery_result;
  reviewActivity wrapped so a review failure never gates delivery (advisory);
  snapshot made best-effort per-file so it can't fail a verified task; auth
  github-signin guard extracted + unit-tested (dead /callback clause removed);
  config requires BOTH github creds; producedPaths sliced; backslash rejected in
  path guard. New tests: reviewActivity/shipActivity/snapshot activity bodies
  (MockActivityEnvironment), MAX_REDIRECTS cap, diamond-skip, github token, the
  signin guard.

### [2026-07-11] Phase 2 M3 — Temporal build orchestrator + durable crash-resume
**Phase:** Phase 2 — Automated Build Pipeline (milestone M3)
**Type:** Progress update
**Summary:** Third milestone: a Temporal workflow orchestrates the frozen
task_graph with a durable state machine that survives a worker restart. New
`packages/orchestrator`: `buildRunWorkflow` (isolate-safe — imports only
@temporalio/workflow + pure policy/types) owns the state machine, pure
topological ordering (`topoSort`), and the per-task retry budget, doing ZERO
IO; all side effects are activities (`loadTaskGraph`, `ensureTaskRow`,
`setRunStatus`, `runTask`, `publishEscalation`). `runTaskActivity` is a thin
wrapper (create sandbox → M1/M2 `buildTask` → dispose) — buildTask/verifier/
Sandbox port unchanged. Two-layer retry (ADR-51): Temporal activity
RetryPolicy handles infra THROWS; the workflow budget (3) acts on returned
`failed{reason}` via a disposition table (budget_exceeded terminal, rest
retry). Escalation signal DEFINED but unwired (M3 auto-fails + emits an
`escalation_required` event; M4 adds the human gate). Run lifecycle moved to
the workflow (ADR-52): M1's blanket run-reaper removed from the orchestrated
path (a non-terminal run is now a resuming workflow, not a crash);
`ensureTaskRow` made idempotent via migration 0005 `UNIQUE(run_id,
spec_task_id)` + ON CONFLICT DO NOTHING. No Temporal Cloud creds — runs on a
local `temporal server start-dev` (dev) and @temporalio/testing (CI). HTTP
surface added: `POST /api/builds` (inserts run, claims ADR-29 slot, starts
the workflow; dup → existing run), `GET /api/builds/:id`,
`GET /api/builds/:id/stream` (coarse phase/task SSE over the run's
stream_events; rich per-turn transcript stays M5). Worker entrypoint
`apps/api/src/worker.ts` (`pnpm --filter @mullion/api worker`). Migration
0005 also adds `tasks.attempt`; documents `stream_events.stream_id` as
intentionally polymorphic (no composite FK).
**Verified:** full DoD green (`check-types`+`lint`+`build`+`test`, 127 unit
tests incl. binary-free policy + MockActivityEnvironment activity tests) plus
the orchestrator integration tier (17 tests): workflow logic (topo order,
retry budget consumes N then fails, budget_exceeded short-circuits, cycle →
failed), the HEADLINE crash-resume proof (worker1 completes task A, is
replaced by worker2, A's activity fires exactly once — completed task NOT
re-run across the restart), and a full-pipeline test (real LocalDockerSandbox
+ scripted Coder + real buildTask driven through the workflow to done). The
crash-resume test uses a real local Temporal dev server (time-skipping can't
model worker handoff).
**Files/areas touched:** packages/orchestrator (new), packages/{db (migration
0005 + schema),schemas (api build shapes),config (Temporal + RUN budget env)},
apps/api (routes/builds, worker, temporal, index, dev/build-task-cli reaper
note), docs/specs/{04,05}
**Related ADR:** New — ADR-50 (workflow/activity split), ADR-51 (two-layer
retry), ADR-52 (run lifecycle → Temporal + idempotent task creation); `05`
table extended 50–52
**Follow-ups:**
- M3 drives `queued→building→done|failed`; `reviewing`/`shipping` + the human
  escalation gate (setHandler + condition on escalationSignal) are M4.
- Sequential dispatch only; parallel-where-deps-allow (needs sandbox
  concurrency policy) deferred.
- verifyCommand is a harness/default (`node --test`); per-task test authoring
  from prose acceptance_criteria stays deferred (ADR-48).
- The live HTTP path (POST /api/builds → worker → done) is wired + typechecked
  and its orchestration core is proven by the integration tests; a full
  running-stack smoke (API + worker + `temporal server start-dev` + Docker)
  needs the Temporal CLI running, like planning needs the OpenRouter mock.
- Multi-lens review (1 Critical, 1 High, 2 Medium, 2 Low + test gaps) run and
  fixed before commit: workflow-level catch so an activity failure can't wedge
  a run in 'building' (Critical); ADR-29 dedup keyed per-user with a
  non-terminal filter + cross-org 409 without leaking ids (High); ambiguous
  workflow-start → 202 (not a fabricated 'failed' that could double-start);
  heartbeat-interval leak on create() throw; deep infra RetryPolicy +
  non-retryable deterministic failures; tasks.attempt now written. New tests:
  real-PG ensureTaskRow idempotency (ADR-52 crux), workflow-catch, mixed-retry
  recover, early-task-fail, escalation assertion, runTaskActivity dispose/
  no-leak, code-level TEMPORAL_INTEGRATION gate.
- FOLLOW-UP: apps/api has no HTTP/auth route-test harness (only unit tests);
  POST /api/builds is covered by inspection + mirrors the proven planning
  route, but a route-integration harness (seeding org/user/session/auth) is a
  Phase-3 hardening item that would serve all of apps/api, not just builds.
- CI note: @temporalio/testing downloads a server binary on first use (cached
  after) — the orchestrator integration tier needs that binary, so it is
  gated by TEMPORAL_INTEGRATION=1 alongside SANDBOX_INTEGRATION=1.

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

### [2026-07-12] Dashboard chrome: navbar → hover-expand sidebar
**Phase:** Phase 0 — Foundation & Platform Wiring (UI polish)
**Type:** Progress update
**Summary:** Replaced `apps/dashboard`'s sticky top navbar with an
Aceternity-style sidebar, per owner decisions: hover-only expand (no pin,
explicitly chosen over a pinned mode), desktop top bar retired, Cormorant
wordmark (no Cinzel added), sign-out moved from the home page into the
sidebar account footer. Desktop: fixed 60px icon rail expanding to 300px
on `:hover`/`:focus-within` as an overlay (main stays at `lg:pl-[60px]`,
content never reflows); labels fade/slide with per-row stagger, one easing
curve (`cubic-bezier(0.22,1,0.36,1)`), asymmetric expand/collapse timing —
all pure CSS, no framer-motion. Mobile (<lg): sticky top bar + full-screen
slide-over dialog with declarative `inert` modality, body scroll lock,
Escape/route-change/link-tap close, focus restore. Nav driven from a
single config array with pure segment-bounded `isActive()` (unit-tested).
Icons via `react-icons/lu` through the existing `wrapIcon` pattern.
Multi-lens review: no Critical/High; applied declarative-inert fix and
confirmed no z-index conflicts. All gates green: check-types, lint, test
(10), build.
**Files/areas touched:** `apps/dashboard/src/components/nav/*` (new:
app-sidebar, mobile-nav, account-menu, nav-items + test), `app/layout.tsx`,
`app/page.tsx`, `app/globals.css`, `components/planning/icons.tsx`,
deleted `components/site-header.tsx`, `design-context.md` file map.
**Related ADR:** None — UI chrome change, choices made interactively by
owner (hover-only, no persistence), no architectural decision.
**Follow-ups:**
- If nav grows past ~8 items, revisit the stagger cap and give the nav
  list its own scroll region.
- Manual visual pass on the React Flow planning surface with the overlay
  expand is still worth an eyeball on a real session.

### [2026-07-12] BYOK, per-role model selection, usage analytics, settings tabs
**Phase:** Phase 5 — fast-follow (post v1 feature-complete)
**Type:** Progress update
**Summary:** Shipped ADR-70/71 end to end. Per-org BYOK OpenRouter key:
encrypted at rest with better-auth's `symmetricEncrypt` (same posture as
GitHub OAuth tokens), validated against OpenRouter's free `GET /key`
probe before persist, saved via a 5/min per-user rate-limited endpoint,
only `key_last4` ever returned. `OpenRouterClient` gained an injected
`apiKeyResolver` + `onByokAuthFailure`: an org with an enabled key pays
with it; a 401/403 on that key disables the row and retries once on the
platform key (recorded `byok=false`) — a dead key degrades, never fails a
build. Per-role model overrides live in `model_overrides`, validated at
write AND read time against a static ZDR-verified allowlist in
`packages/llm/src/model-allowlist.ts` (curated by PR); overrides apply
only while a BYOK key is enabled (platform pays → platform picks);
routing cache re-keyed to `org:role` to prevent cross-org leaks. Budget
split per ADR-70: org 24h window now excludes BYOK spend, per-run ceiling
counts everything. `cost_events` gained `byok` + denormalized
`prompt_tokens`/`completion_tokens`; `GET /api/settings/analytics`
aggregates totals/per-role/per-day on the fly. Dashboard `/settings`
retrofitted to URL-driven tabs (Profile / Models / Analytics) with new
hand-rolled `tabs`/`select`/`confirm-dialog` primitives, TanStack Query
hooks, optimistic model-row saves, inline-SVG sparkline + role bars (no
chart dependency). Migration 0008 (additive). Gates green: check-types,
lint, test, plus API_INTEGRATION suite (5 new settings tests, 9 new LLM
BYOK tests).
**Files/areas touched:** `packages/db` (schema + 0008), `packages/llm`
(client, model-allowlist, errors, byok.test), `packages/agents/budget.ts`,
`apps/api/src/modules/settings/*` (new), `lib/llm.ts`, `worker.ts`,
`app.ts`, `app.integration.test.ts`, `apps/dashboard/src/{app/settings,
components/settings,components/ui,hooks,lib}`, `docs/specs/04` (ADR-70/71).
**Related ADR:** ADR-70 (BYOK key lifecycle, budget split), ADR-71
(per-role overrides, static allowlist).
**Follow-ups:**
- Per-user keys, spend alerts, real-time meters deliberately deferred
  (see ADR-70 alternatives; `03` scope discipline).
- Allowlist currently Claude-family only — widen via PR as ZDR coverage
  of other families materializes.
- Build-kickoff pre-flight `validateKey` probe not wired yet: the
  client-level fallback covers the failure mode, but an early block at
  kickoff would fail faster. Candidate for the next API touch.

### [2026-07-12] BYOK fast-follows: member read-only UI, dev-mock probe skip, multi-family allowlist
**Phase:** Phase 5 — fast-follow
**Type:** Progress update
**Summary:** Closed three follow-ups from the BYOK ship. (1) Non-admin org
members now get a read-only settings surface: `canManage` (from the
verified membership role) rides GET /byok and GET /models; members see
masked key status and disabled model selects with an explanatory note —
enforcement unchanged server-side. (2) The key-save probe is skipped when
the dev `OPENROUTER_BASE_URL` loopback override is active (no `GET /key`
there); production always probes. (3) `MODEL_ALLOWLIST` widened from
Claude-only to multi-family, verified against OpenRouter's LIVE ZDR
endpoint list (`/api/v1/endpoints/zdr`) on 2026-07-12 — provider policy
pages alone don't count, and notably the newest flagship generation of
every family (Opus 4.8, Sonnet 5, GPT-5.6, Gemini 3.x, Qwen 3.7, Kimi
K2.6+, Mistral Medium 3.5+) plus the entire xAI Grok line have zero ZDR
endpoints today. Per-role price bands by task complexity: planner
frontier ($1.4–5/M in: Opus 4.7/4.6, Sonnet 4.6, GLM-5.2), analyst +
reviewer mid-premium (Sonnet 4.6/4.5, Gemini 2.5 Pro, GLM-5.1 /
DeepSeek-R1), coder mid-cheap (Haiku 4.5, GLM-4.7, DeepSeek v3.x),
tester fast-cheap (Llama 3.3-70B/4-Scout, gpt-oss-120b, Mistral Small),
devops cheapest (gpt-oss-20b, Gemini Flash-Lite, GPT-4.1-nano). Platform
DEFAULT routing stays Claude-only (ADR-26 two-ZDR-provider failover
rationale untouched). ADR-71 amended with the concrete ZDR-verification
rule. Gates green incl. integration settings suite.
**Files/areas touched:** `packages/llm/src/model-allowlist.ts`,
`apps/api/src/modules/settings/routes.ts`, dashboard settings components
(`byok-key-card`, `model-role-row`, `models-section`, `settings-api`),
tests updated for role-appropriate slugs, `docs/specs/04` (ADR-71 note).
**Related ADR:** ADR-70/71.
**Follow-ups:**
- Re-check `/api/v1/endpoints/zdr` when adding newest-gen flagships
  (none ZDR-listed as of 2026-07-12).
- Per-user keys, spend alerts, real-time meters remain v2 (ADR-70).
