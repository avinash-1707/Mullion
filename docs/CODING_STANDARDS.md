# Mullion — Coding Standards

## 0. Philosophy

This project's whole process runs on not letting things default silently
— every architectural decision is logged rather than assumed (see
`docs/specs/04_design_decisions_log.md`). Code should follow the same discipline:
types make invalid states unrepresentable instead of hoping callers are
careful, comments explain reasoning instead of narrating syntax, and
errors are handled deliberately instead of swallowed.

---

## 1. TypeScript

- **Strict mode, no exceptions**: `strict: true`, plus
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. If a type
  error is inconvenient, fix the type — don't loosen the compiler.
- **No `any`, ever.** Where a shape is genuinely unknown until runtime
  (LLM output, an external API response, a webhook body), type it as
  `unknown` and narrow it with a schema parse — never cast past the
  compiler with `any` or `as` to make an error disappear.
- **Zod (or equivalent) at every trust boundary**: API request/response
  bodies, environment variables, SSE payloads, and — especially — LLM
  outputs. A type annotation says what an LLM's response *should* look
  like; it does nothing to guarantee that it does. Parse and validate
  before trusting structure, the same way `02`'s Tester output is
  "structurally validated, never trusted as free text" — apply that
  principle to every external input, not just test results.
- **Discriminated unions over string flags** for anything with real
  states — agent message types, build phase, escalation-gate outcome.
  Switch over them exhaustively with a `never` check in the default case,
  so adding a new variant is a compile error everywhere it isn't handled,
  not a silent runtime gap.
- **Named exports only.** No default exports — they rename silently on
  import, break refactor tooling, and make cross-package searches harder
  in a monorepo this size.

---

## 2. Monorepo structure (Turborepo)

- **`apps/` is thin.** `apps/web` (Next.js), `apps/api` (Hono), and any
  worker app are composition and wiring only — routing, request handling,
  process entry points. Business logic that could conceivably be tested
  without spinning up a server does not belong in `apps/`.
- **`packages/` is where shared things actually live**, at minimum:
  - `packages/schemas` — Zod schemas (and their inferred types) for the
    Build Spec, decision log entries, agent messages, and API contracts.
    Single source of truth, imported by both `apps/web` and `apps/api` —
    never hand-duplicated on either side.
  - `packages/db` — the Drizzle schema and client.
  - `packages/llm` — the OpenRouter client wrapper. This is the **only**
    place a model slug is ever written down; see §3.
  - `packages/config` — shared `tsconfig`, ESLint config, env schema.
  - `packages/ui` — shared components/design tokens, if more than one
    surface ends up needing them.
- **If two apps need the same type or logic, it moves to `packages/`.**
  Never cross-import between `apps/` directly — that's exactly the
  duplication Turborepo's structure exists to prevent.
- **Each package exposes a narrow public surface.** Its `index.ts` exports
  only what's meant to be consumed externally; internal files stay
  internal. Avoid deep barrel-export chains more than one level deep — they
  slow builds down and make circular imports easy to introduce by
  accident in a repo this size.

---

## 3. Modularity, aligned to the architecture

- **Every agent (Analyst, Planner/Architect, Coder, Tester, Reviewer,
  DevOps) implements the same interface/contract.** Adding or modifying a
  role should mean filling in a known shape, not inventing new plumbing
  each time.
- **Within an agent module, keep these separate**: constructing the
  prompt, making the LLM call, parsing/validating the response, and
  performing side effects (sandbox exec, git operations, tool calls). Four
  distinct functions, not one that does all of it — each one becomes
  independently testable, and a bug in "the model returned malformed JSON"
  stays visibly distinct from "the sandbox call failed."
- **The OpenRouter wrapper in `packages/llm` is the only place a model
  string appears.** Every call site references a *role* (`analyst`,
  `coder`, etc.), never a model slug directly — this is what makes ADR-25's
  config table actually enforceable in code rather than just in a spec.
- **Temporal workflow code stays deterministic.** No `Date.now()`, no
  `Math.random()`, no direct network or LLM calls, no branching on
  anything not derived from workflow input or activity results — all of
  that belongs in activities, never in the workflow function itself. This
  is the single most common way to quietly break Temporal's durability
  guarantee, and it fails in ways that are easy to miss in review.

---

## 4. Error handling

- **No empty catch blocks, ever.** Every catch either handles the error,
  rethrows with added context, or logs with enough detail to actually
  debug later.
- **Typed errors over string matching.** Distinguish retryable, fatal, and
  needs-escalation failures with actual error classes or a `Result<T, E>`
  return type — not by inspecting `error.message` for a substring.
- **A partial failure should never look like success.** Same discipline
  the build pipeline already applies to agent output: don't let a caught
  exception, an empty response, or a timeout get treated as a valid empty
  result further up the call stack.

---

## 5. Comments

- **Explain *why*, not *what*.** If a reader needs a comment to understand
  what a line does, the code needs better names or structure instead — a
  comment shouldn't be doing the job that clarity in the code should.
- **Comment the non-obvious**: a workaround for a library's quirk, the
  reasoning behind a rejected alternative, a constraint that isn't visible
  from the code itself (e.g., "must run in an activity, not the workflow
  — Temporal determinism"). Nothing else needs one.
- **Proportional, not padded.** A one-line reason gets one line. Something
  genuinely subtle earns a short paragraph. Never a wall of text, and
  never a comment restating the line directly below it.
- **No commented-out code left behind.** Delete it — version control
  remembers what git rm actually does not.

---

## 6. Testing

- **Mock at the OpenRouter-client boundary**, using the recorded/replay
  cache already specified in `02` §10.1 — not ad hoc, per-test stubs
  scattered across the codebase. One consistent mechanism for "don't
  actually call a paid API in tests."
- **Test the parsing/validation layer independently of the live call.**
  Given a canned (possibly malformed) LLM response, does the agent's
  response handler do the right thing? This should never require a real
  network call to verify.

---

## 7. Config & secrets

- **Every environment variable validated against a schema at process
  startup.** Fail immediately and loudly on a missing or malformed value —
  never proceed with `undefined` and let it surface three layers deep as a
  confusing runtime error.
- **No secrets in code or committed files.** Given how many external
  services this touches — Neon, OpenRouter, E2B, Temporal Cloud, Better
  Auth, GitHub OAuth — this is worth stating explicitly rather than
  assuming it's obvious.

---

## 8. API contracts

- **One schema per Hono route, defined once in `packages/schemas`**,
  imported by both the API handler and the Next.js frontend. Never
  hand-written on both sides — that's exactly the kind of drift a
  monorepo is supposed to make impossible.

---

## 9. UI & frontend

Visual direction, palette, typography, and motion specifics are
intentionally **not** dictated here — frontend design and animation skills
are already configured for this project, and hardcoding a look or specific
timing values in this doc would just fight with whatever those produce.
What follows are engineering requirements that hold regardless of
whatever direction the design skill lands on for a given surface:

- **Responsive by default.** Every surface — including the live diagram
  and decision log — usable down to mobile width, not designed at desktop
  and shrunk afterward as an afterthought.
- **Every interactive element gets real hover/focus/active states** and
  visible feedback on press. The specific style of that feedback is a
  design decision; its presence is not optional.
- **Keyboard focus stays visible everywhere.** Never remove a focus
  outline without replacing it with something equally visible.
- **`prefers-reduced-motion` is respected wherever animation appears** —
  whatever motion the design work produces still needs a reduced-motion
  fallback, not just the obviously large effects.
- **Skeleton states over bare spinners** wherever the content shape is
  already known before it loads.
- This product's one interaction a generic CRUD app doesn't have — agents
  visibly planning in front of the user, live — is worth flagging as the
  natural focal point when applying the design/animation skills, but the
  actual treatment is theirs to decide, not this document's.

---

## 10. Naming & file conventions

- `kebab-case` for files and folders, `PascalCase` for components and
  types, `camelCase` for functions and variables — pick one and don't mix
  within a package.
- Barrel files (`index.ts`) only at a package's public boundary (§2) —
  never nested arbitrarily deep inside it.

---

## 11. Dependencies, external libraries & phase-end review

- **Install packages through the package manager's add command**
  (`pnpm add <package>`), never by hand-typing a version number into
  `package.json`. The command resolves to whatever's actually latest and
  compatible at install time — a version remembered from training data
  may already be stale by the time it's written down.
- **Verify usage against the library's official documentation before
  writing code against it, not after review flags something wrong.** API
  shapes, breaking changes, and recommended patterns move fast — this
  matters especially for the fast-moving pieces of this stack (OpenRouter,
  Better Auth, Temporal, Drizzle, E2B), where memory alone is not a
  reliable source for exact call signatures.
- **A security review runs at the end of every phase** (phase boundaries
  are defined in `docs/specs/05_build_plan.md`), not just once at the project's end.
  Whatever it surfaces gets fixed before moving to the next phase — never
  queued as later cleanup that compounds with whatever the next phase
  builds on top of it.
