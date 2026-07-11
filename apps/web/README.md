# apps/web

> The Next.js 16 (App Router, React 19) marketing and auth app: landing, pricing, sign-in and sign-up on the root domain.

The signed-in product lives in `apps/dashboard` (app. subdomain in prod, `:3001` in dev, ADR-64). This app owns everything a logged-out visitor sees, plus the credential auth pages.

> **Heads up:** this is a non-standard Next.js version with breaking changes. Read `node_modules/next/dist/docs/` before coding against it (see `AGENTS.md`). One notable rename: `src/proxy.ts` is this app's middleware, and it is the single source of truth for the per-request CSP nonce (`strict-dynamic`).

## Auth hand-off (ADR-64)

Auth is centralized on the Hono API. This app hosts the sign-in and sign-up forms; on success (or when an already-authed visitor hits an auth page) the browser does a full-page navigation to the dashboard app, honoring a `?returnTo=` deep link only after `src/lib/return-to.ts` validates it against the dashboard origin (open-redirect guard, unit-tested). Old product paths (`/dashboard`, `/builds/*`, `/sessions/*`) redirect to the dashboard app via `next.config.ts`.

## Routes

| Route | What |
|---|---|
| `/` | Marketing landing with the phase walkthrough |
| `/pricing` | Tier cards, comparison table, FAQ |
| `/sign-in`, `/sign-up` | Better Auth credential auth (sign-in is required for everything, ADR-35); hands off to the dashboard app on success |

## Layout

| Path | What |
|---|---|
| `src/components/landing/` | Landing sections (hero, manifesto, crew, pricing, FAQ, footer, Lenis smooth scroll) |
| `src/components/auth/` | Auth shell + sign-in/sign-up forms |
| `src/components/ui/` | Marketing-styled form primitives (input, label, checkbox, separator) |
| `src/lib/` | `api.ts` (fetch + `ApiError`), `auth-client.ts`, `return-to.ts` (validated hand-off) |
| `src/config/` | `site.ts`, `metadata.ts` (SEO factory) |
| `src/proxy.ts` | Middleware (CSP nonce) |

## Env

| Var | What |
|---|---|
| `NEXT_PUBLIC_API_URL` | Hono API origin (Better Auth server) |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin for SEO metadata |
| `NEXT_PUBLIC_DASHBOARD_URL` | Dashboard app origin — hand-off target and returnTo allowlist |

## Run

```
cp .env.example .env.local
pnpm dev                     # http://localhost:3000, needs apps/api running
```

## Testing

`pnpm test` — vitest over `src/lib/return-to.test.ts` (the open-redirect guard). Everything else is covered by the API's integration tests and the manual verification passes in `docs/verification/`.
