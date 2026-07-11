# Phase 3 verification pass — 2026-07-11

The genuine verification the build plan's Phase 3 requires (a check of
behavior, not configuration), covering the four named items plus the
deferred EXPLAIN follow-up from the Phase 0 DB audit. Each item states what
was actually exercised and what remains credential-gated.

## 1. Sandbox egress restrictions — VERIFIED LIVE (local driver)

`packages/sandbox/src/egress.integration.test.ts` — a sandbox actively
attempts DNS resolution, direct-IP TCP to 1.1.1.1:443 (no DNS involved),
HTTPS fetch, and a container→host loopback connection. All four attempts
fail against the hardened local Docker driver (`NetworkMode: "none"`,
ADR-47). Run: `SANDBOX_INTEGRATION=1 vitest run egress.integration.test.ts`
— 4/4 passing.

**E2B half:** the suite is driver-parameterized and is the parity test
`select.ts` requires before `SANDBOX_DRIVER=e2b` may be enabled. No E2B key
exists; the adapter stays refused at construction (fail-closed — stricter
than ADR-44's original text; amendment recorded there). Nothing can
silently run un-isolated.

## 2. ZDR-only routing (ADR-27) — HARNESS READY, LIVE HALF CREDS-GATED

Config-level enforcement was already structural and unit-tested
(`provider: {zdr: true}` hardcoded, no `models` fallback array,
`zdr_only=false` routing rows rejected). The live half — "the config flag
demonstrably restricts routing in practice" — needs a real key:
`apps/api/src/dev/verify-zdr-cli.ts` now performs it end to end: per routed
slug it fetches OpenRouter's endpoint list, collects the providers OpenRouter
itself marks ZDR-eligible, makes a real 1-token completion through the app's
own client, resolves which provider served it via the generation API, and
fails unless served ∈ ZDR-eligible. Unrecognized API shapes fail loudly —
never inferred passes. **Run this the day OPENROUTER_API_KEY lands.**

## 3. Better Auth session/cookie security — REVIEWED + LIVE-CHECKED

Live inspection (real sign-up/sign-in against the booted API):
`better-auth.session_token` is `HttpOnly`, `SameSite=Lax`, `Max-Age=604800`
(7d), signed value. `Secure` is absent in dev because the baseURL is http —
correct behavior; **production now boot-fails unless API_ORIGIN/WEB_ORIGIN
are https** (added to the env schema in this pass), which is the condition
under which Better Auth marks cookies Secure.

Config review: secret ≥32 chars enforced at boot; trustedOrigins pinned to
the exact web origin; credentialed CORS with exact origin; origin-checking
CSRF middleware ahead of all state changes; GitHub blocked as a sign-in
method (link-only, ADR-56); rate limits in front of `/api/auth/*`.
Defaults accepted knowingly: password min length 8 (Better Auth default),
no cookieCache (every request validates against the DB — correct-first).

## 4. ADR cross-check (ADR-01…60) — ZERO UNIMPLEMENTED

Three parallel review passes over the full log, each demanding file:line
evidence. **Result: 60/60 implemented** — no paper-only decisions. Nuances,
all recorded rather than left silent:

- **ADR-09/10 (E2B, Temporal Cloud):** decisions realized in code (real SDK
  adapters, config-only swap); the live services themselves await creds —
  matching the plan's phase scoping, not gaps.
- **ADR-27:** live-response half creds-gated; harness ready (item 2).
- **ADR-44:** code stricter than ADR text — amendment added to `04`.
- **Doc staleness fixed in this pass:** build plan §0's "through ADR-36"
  range and the §6 coverage table (now extended through ADR-60).

## 5. EXPLAIN pass on hot queries (Phase 0 audit follow-up) — VERIFIED

Against local Postgres seeded to 100k `stream_events`:

- **SSE poll** (`stream_id = ? AND org = ? AND id > cursor ORDER BY id
  LIMIT 500`): 0.65ms on fat streams (pkey scan, planner-correct at 1/10
  selectivity), 0.16ms on sparse 1-of-1000 streams via
  `stream_events_stream_idx` bitmap scan. Both plans index-driven; no seq
  scans, no sort nodes.
- **Better Auth session lookup** (`session.token`): unique-index scan,
  0.02ms. **Membership lookup** (`member.user_id`): `member_user_id_idx`,
  0.03ms.

No schema changes warranted at v1 scale.

## Outstanding (single list, all credential-gated)

| Item | Unblocks on | Harness |
|---|---|---|
| ZDR live-response verification | OPENROUTER_API_KEY | `verify-zdr-cli.ts` (ready) |
| E2B egress parity | E2B key + adapter hardening | `egress.integration.test.ts` (add driver) |
| Temporal Cloud connection | Cloud creds | config-only (`TEMPORAL_ADDRESS`/TLS) |
| Live OTLP trace export | any OTLP collector | set `OTEL_EXPORTER_OTLP_ENDPOINT` |
| Live eval baseline | OPENROUTER_API_KEY | `evals.yml` manual dispatch, mode=live |
