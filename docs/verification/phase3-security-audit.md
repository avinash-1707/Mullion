# Phase 3 comprehensive security audit — 2026-07-11

The comprehensive cross-service audit the per-phase reviews (Phases 0–2)
built toward, not a replacement for them. Five parallel lenses over the
entire standing surface — not just this phase's diff — each demanding
file:line evidence and a concrete exploit scenario before a finding
counted. Every confirmed finding was fixed in this pass; deferred items are
listed explicitly with their trigger.

## Coverage

| Lens | Surface |
|---|---|
| 1 | Auth, multi-tenancy, HTTP API surface (apps/api routes, middleware, auth, sse, github) |
| 2 | LLM boundary, prompt injection, cost containment, dev tooling (packages/llm, agents, evals) |
| 3 | Sandbox isolation, Temporal orchestrator, artifacts, delivery (packages/sandbox, orchestrator, artifacts, delivery) |
| 4 | Secrets, config, CI pipelines, observability exhaust, dependencies (config, .github, otel) |
| 5 | Web frontend incl. the new build dashboard (apps/web) |

**Result: no Critical, no High.** No cross-tenant read/write, no auth
bypass, no sandbox escape, no committed secret, no XSS sink. Findings were
4 Medium + 11 Low; all fixed below.

## Fixed this pass

### Medium

1. **Build SSE stream re-checked run-existence, not membership** (Lens 1) —
   a revoked org member kept receiving a build's event feed until the
   30-min lifetime cap, unlike the planning stream which re-checks
   membership every minute. `builds.ts` `assertAccess` now re-queries
   `member` by `(userId, organizationId)`.
2. **GitHub OAuth tokens stored plaintext at rest** (Lens 1) — the linked
   token is `repo`-scoped and never expires; a DB-read exposure handed out
   live tokens. Enabled Better Auth `account.encryptOAuthTokens`
   (AES-256-GCM, keyed off the auth secret).
3. **Non-streaming LLM response body had no size cap** (Lens 2) — the
   stream path capped at 2M chars since Phase 1, but the primary
   tool-calling build path did `await response.json()` unbounded; a hostile
   provider or tampered cassette could OOM the process inside the 120s
   timeout. Added `readBodyCapped` to both non-streaming methods; regression
   test added.
4. **GitHub delivery was not crash-idempotent** (Lens 3) — a worker crash
   after repo creation but before the delivery row meant the retry hit a 422
   ("name exists"), swallowed it, and permanently lost the delivery
   (violating ADR-33). Delivery now resolves the existing repo on 422 and
   resumes the push; an existing ref is treated as already-delivered. Two
   regression tests added.
5. **No CSP / frame-ancestors on the frontend** (Lens 5) — the build
   dashboard's one-click escalation approve/abandon was clickjackable. Added
   `frame-ancestors 'none'` + `X-Frame-Options: DENY` +
   `X-Content-Type-Options` + `Referrer-Policy` on every response; verified
   live.

### Low (all fixed)

- **Negative-cost budget poisoning** (Lens 2) — `cost: z.number()` accepted
  negatives that would decrement the ADR-31 budget sums; now `.nonnegative()`.
- **Coder tool call sent no `maxTokens`** (Lens 2) — one turn's size/cost was
  bounded only by the provider default; now capped at 16k.
- **build-task-cli reaper unscoped** (Lens 2) — failed every non-terminal run
  on a shared dev DB, not just the caller's; now scoped to `session.userId`.
- **Reviewer fed the whole tree to the LLM uncapped** (Lens 3) — bounded to
  60 files / 400KB / 20k chars-per-file with an omission note.
- **`repoName` from an 8-char run-id prefix could collide** (Lens 3) — widened
  to 12 dash-stripped hex chars.
- **Third-party Actions pinned by mutable tag** (Lens 4) — the evals workflow
  holds a secret + `contents:write` + pushes to main; all `uses:` in both
  workflows now pinned to full commit SHAs; added `dependabot.yml`.
- **`OPENROUTER_BASE_URL` had no production guard** (Lens 4) — now rejected at
  boot in production, matching `LLM_REPLAY_MODE`.
- **`ci.yml` declared no `permissions`** (Lens 4) — added
  `permissions: contents: read`; moved evals' `contents: write` from
  workflow to job scope.
- **`DATABASE_URL` accepted non-TLS in production** (Lens 4) — production now
  requires `sslmode=require`/`verify-full`/`verify-ca`.
- **Malformed `Referer` threw a 500 in the CSRF gate** (Lens 1) — now treated
  as "no provenance".
- **Delivery link rendered any http(s) host** (Lens 5) — a prompt-injected ref
  could phish from the trusted panel; now links only https + an allowlisted
  host (github.com), everything else renders as inert copyable text.
- **Credential endpoints rode only the 300/min global limit** (Lens 1) —
  added a 10/min/IP limiter on `/api/auth/sign-in/*` and `/sign-up/*`.
- **Clipboard write had no catch** (Lens 5) — wrapped; an insecure-context
  rejection no longer surfaces as an unhandled rejection.

## Post-audit debt-clearing pass (2026-07-11)

Four of the deferred items below were cleared in a follow-up pass (commits
after the audit), leaving only the creds/kernel-gated ones:

- **Escalation wrong-gate** → FIXED — decisions now routed by target
  `specTaskId` through a per-task map; API validates the id belongs to the
  run; integration test proves a mis-tagged decision is ignored.
- **No artifact-store GC** → FIXED — `ArtifactStore.sweepStale(ttl)` +
  worker timer + `ARTIFACT_RETENTION_MS` (7d default).
- **Sign-in guard untested** → FIXED — apps/api route-test harness built
  (`app.ts`/`app.integration.test.ts`, gated `API_INTEGRATION=1`, CI job
  added); the GitHub-sign-in-blocked 403 and callback-mints-no-user cases
  are now covered end to end.
- **Full script-src CSP** → FIXED — per-request nonce CSP via Next 16's
  `proxy.ts`; `script-src 'self' 'nonce-…' 'strict-dynamic'`, verified live.

## Deferred (with trigger)

These were surfaced, judged acceptable for v1, and left with an explicit
condition that flips them:

- **Symlink read at snapshot time** (Lens 3) — a model can symlink a
  container file into the delivered repo. Harmless today: the container has
  no bind mounts, no secret env, `NetworkMode: none`, so a symlink resolves
  to the public base image only. **Trigger:** hard-gate on ever passing
  `envs`/mounts to `create()` — add an in-container `realpath` check under
  `/workspace` before that lands (already committed to in the port comment).
- **Budget is a lagging soft ceiling** (Lens 2) — an in-flight turn's cost
  isn't counted until recorded; concurrent same-org users have a TOCTOU
  window. Bounded by per-task caps; consistent with ADR-31's design.

## Residual accepted risk (documented, not a finding)

Local Docker shares the host kernel — a kernel 0-day container escape is out
of reach of process-level hardening. This is exactly why ADR-47 targets E2B
(microVM) and `select.ts` refuses E2B only until *isolation parity*. The v1
posture (full hardening, shared kernel, local-only) is an explicit decision.
