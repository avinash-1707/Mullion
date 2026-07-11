# apps/dashboard

> The Next.js 16 (App Router, React 19) signed-in product app, served from the app. subdomain in prod and `:3001` in dev (ADR-64).

Idea intake, clarifying MCQ, live planning canvas, build view, and delivery. Marketing, landing and the auth pages live in `apps/web`.

> **Heads up:** this is a non-standard Next.js version with breaking changes. Read `node_modules/next/dist/docs/` before coding against it (see `AGENTS.md`). One notable rename: `src/proxy.ts` is this app's middleware, and it is the single source of truth for the per-request CSP nonce (`strict-dynamic`).

## High-level idea

The client renders the two live experiences the product is built around:

1. **Planning canvas.** The Planner agent's architecture graph and decision log build up in real time over SSE. The user can interrupt with a free-text edit at any point. This is allowed only during planning, never during a build (ADR-02).
2. **Build view.** Task list, live agent graph, event timeline, and the escalation gate (approve, redirect, or abandon). The gate looks and works differently from planning edits on purpose (ADR-07).

All API handling goes through TanStack Query. Auth state stays on Better Auth's client hooks. `lib/api.ts` returns `unknown`, and every caller parses the response with the shared Zod contracts from `@mullion/schemas`. That way the client and server cannot drift apart.

## Auth (ADR-64)

Every page is auth-gated client-side: once `useSession()` settles with no session, `src/lib/auth-redirect.ts` sends the browser to `apps/web`'s `/sign-in` with a `returnTo` pointing back at the current deep link. A 401 caught mid-page (expired cookie on a fetch or the SSE stream) funnels through the same redirect. Sign-out lands on the marketing root. The session cookie lives on the API origin only — this app never reads it, the browser just sends it along on credentialed calls.

## Routes

| Route | What |
|---|---|
| `/` | Signed-in home with the idea intake form |
| `/sessions/[id]` | Planning session: requirements, architecture, and confirmed phases, plus an agent status strip |
| `/builds` | Build run list |
| `/builds/[id]` | Single run: header, escalation gate, task list, agent graph, event timeline, delivery panel |

## Layout

| Path | What |
|---|---|
| `src/components/planning/` | Idea intake, MCQ rounds, requirements doc, architecture diagram (`@xyflow/react` + dagre), decision log, consistency panel, fork-choice cards, edit prompt bar |
| `src/components/build/` | Run header, agent graph, task list, event timeline, escalation gate, delivery panel |
| `src/hooks/` | TanStack Query hooks (`use-planning-session`, `use-build-run`, auth mutations) |
| `src/lib/` | `api.ts` (fetch + `ApiError`), `auth-client.ts`, `auth-redirect.ts`, `build-stream.ts` + timeline reducer (SSE), graph layout and mapping, planning reducer |
| `src/proxy.ts` | Middleware (CSP nonce) |

## Env

| Var | What |
|---|---|
| `NEXT_PUBLIC_API_URL` | Hono API origin (Better Auth server + all `/api/*` calls) |
| `NEXT_PUBLIC_WEB_URL` | Marketing/auth app origin — sign-in redirect and sign-out landing |

## Run

```
cp .env.example .env.local
pnpm dev                     # http://localhost:3001, needs apps/api running
```

Stack: Tailwind CSS v4, TanStack Query, Better Auth client, React Flow.

## Testing

No test suite in this app. The cross-origin seams are covered by `apps/web`'s `return-to` unit tests and the API's multi-origin integration tests.
