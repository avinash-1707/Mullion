# apps/web

> The Next.js 16 (App Router, React 19) frontend: the full product journey in one app.

Idea intake, clarifying MCQ, live planning canvas, build view, and delivery.

> **Heads up:** this is a non-standard Next.js version with breaking changes. Read `node_modules/next/dist/docs/` before coding against it (see `AGENTS.md`). One notable rename: `src/proxy.ts` is this app's middleware, and it is the single source of truth for the per-request CSP nonce (`strict-dynamic`).

## High-level idea

The client renders the two live experiences the product is built around:

1. **Planning canvas.** The Planner agent's architecture graph and decision log build up in real time over SSE. The user can interrupt with a free-text edit at any point. This is allowed only during planning, never during a build (ADR-02).
2. **Build view.** Task list, live agent graph, event timeline, and the escalation gate (approve, redirect, or abandon). The gate looks and works differently from planning edits on purpose (ADR-07).

All API handling goes through TanStack Query. Auth state stays on Better Auth's client hooks. `lib/api.ts` returns `unknown`, and every caller parses the response with the shared Zod contracts from `@mullion/schemas`. That way the client and server cannot drift apart.

## Routes

| Route | What |
|---|---|
| `/` | Marketing landing with the phase walkthrough |
| `/sign-in`, `/sign-up` | Better Auth credential auth (sign-in is required for everything, ADR-35) |
| `/dashboard` | Signed-in home with the idea intake form |
| `/sessions/[id]` | Planning session: requirements, architecture, and confirmed phases, plus an agent status strip |
| `/builds` | Build run list |
| `/builds/[id]` | Single run: header, escalation gate, task list, agent graph, event timeline, delivery panel |

## Layout

| Path | What |
|---|---|
| `src/components/planning/` | Idea intake, MCQ rounds, requirements doc, architecture diagram (`@xyflow/react` + dagre), decision log, consistency panel, fork-choice cards, edit prompt bar |
| `src/components/build/` | Run header, agent graph, task list, event timeline, escalation gate, delivery panel |
| `src/hooks/` | TanStack Query hooks (`use-planning-session`, `use-build-run`, auth mutations) |
| `src/lib/` | `api.ts` (fetch + `ApiError`), `auth-client.ts`, `build-stream.ts` + timeline reducer (SSE), graph layout and mapping, planning reducer |
| `src/proxy.ts` | Middleware (CSP nonce) |

## Run

```
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:8787
pnpm dev                     # http://localhost:3000, needs apps/api running
```

Stack: Tailwind CSS v4, TanStack Query, Better Auth client, React Flow.

## Testing

No test suite in this app. Behavior is covered by the API's integration tests and the manual verification passes in `docs/verification/`.
