# Mullion dashboard design context

This file is the design memory for the signed-in product surface (app.
subdomain — dashboard home, planning, builds). Read it before extending
the UI so new screens match this pass. The marketing surface (landing,
pricing, auth, 404) has its own palette and its own
`apps/web/design-context.md` — don't cross-reference tokens between the
two; each app carries only its own (ADR-64).

## The dark-hybrid principle

The product stays dark. This was never in question — a build dashboard,
an architecture diagram, a decision log are dense data UI, and dark
backgrounds keep that density readable for long sessions. What changed in
this pass is which dark, and which accent: the product now uses the
brand's actual ink (`#08080d`, not a generic near-black) and the brand's
actual accent (ember, not a warm amber that had drifted from the
marketing palette). The type system — serif display, mono labels, Inter
body — is the same system as the marketing site, just deployed at product
density instead of editorial density.

Rule of thumb when extending this surface: **dense data areas favor
legibility over editorial flourish.** The marketing site can afford a
100px hero heading and 9rem of vertical breathing room; a table of build
tasks cannot. Bring the brand's voice (serif headings, mono labels, ember
accent, hairline structure) into the product, but keep information
density and scan-ability the priority. When the two pull against each
other, legibility wins.

## Tokens

All tokens live in `src/app/globals.css` under `@theme`. Use tokens, never
raw hex, in components.

| Token | Value | Status | Use |
|---|---|---|---|
| `bg` | `#08080d` | **changed** (was `#0a0b0d`) | Page background — brand ink |
| `surface` | `#10101a` | **changed** (was `#141519`) | Cards, panels — brand ink-soft |
| `elevated` | `#191927` | **changed** (was `#1a1c22`) | One step up from surface (modals, hover fills, skeletons) — same ink hue family, not neutral gray |
| `border` | `rgba(232,230,224,0.1)` | unchanged | Functional UI borders — inputs, dividers inside dense components |
| `border-strong` | `rgba(232,230,224,0.2)` | unchanged | Emphasized functional borders (secondary button, focused card) |
| `fg` | `#edece7` | unchanged | Primary text — already reads as warm cream-white, doubles as "cream text on ember" |
| `fg-muted` | `#9a9ca5` | unchanged | Secondary text |
| `fg-faint` | `#83858e` | unchanged | Tertiary text, disabled marks |
| `accent` | `#c4552a` | **repointed** (was `#f2a65a` amber) | Now equals ember. Every existing `accent`/`accent-strong`/`accent-soft` usage inherited the brand automatically — no call-site changes needed |
| `accent-strong` | `#d96b3d` | **repointed** | Hover state of accent |
| `accent-soft` | `rgba(196,85,42,0.14)` | **repointed** | Soft fills, focus rings, `::selection`, scrollbar hover |
| `ember` / `ember-strong` | `#c4552a` / `#d96b3d` | **new** | Same values as accent, named explicitly for when the brand color is the point (buttons, focus rings) rather than "the themeable accent" |
| `gilt` | `#c99b2e` | **new** | Eyebrows, small labels, tags, borders on tags — never large fills |
| `parchment` / `parchment-faint` | `rgba(242,236,221,0.72)` / `rgba(242,236,221,0.44)` | **new** | Reserve for prose-like body copy on dark that wants a warmer white than `fg`/`fg-muted`. Not yet used anywhere in this pass — available for passes 2–3 if a planning/build surface needs it |
| `hairline` | `rgba(201,155,46,0.18)` | **new** | Decorative structural rules (section dividers, chrome borders) — gilt at low alpha, distinct from functional `border`/`border-strong` |
| `danger` / `danger-soft` | unchanged | unchanged | Functional — do not theme to brand |
| `success` / `success-strong` / `success-soft` | unchanged | unchanged | Functional — do not theme to brand |
| `node-datastore` / `node-external` (+ `-soft`) | unchanged | unchanged | Functional — Phase 2 diagram semantics, do not theme to brand |

**Why two accent-shaped things (`accent` and `ember`) with identical
values:** `accent` is the generic "this app's primary interactive color"
slot — existing code (buttons, focus-visible outline, scrollbar hover,
`::selection`) already keys off it and needed zero call-site changes to
pick up the brand. `ember` is the brand token proper, for new code where
you want to say "this is ember" on purpose (e.g. a focus ring that should
read as branded, not just "whatever the accent is"). Use `accent` for
anything that was already accent-colored pre-restyle; reach for `ember` /
`gilt` directly when writing new brand-forward UI (buttons, eyebrows,
tags).

**What stayed functional, on purpose:** `fg` family, `border` /
`border-strong`, `danger*`, `success*`, `node-datastore*`,
`node-external*`. These encode meaning (error, success, data store vs.
external service) that must stay legible and distinct regardless of
brand refresh — they are not decorative and passes 2–3 should not touch
them either.

## Type recipes

Same three faces as marketing (`font-serif` = Cormorant Garamond 500,
`font-mono` = JetBrains Mono, default body = Inter), scaled down for
product density:

- **Page title**: `font-serif text-4xl leading-tight tracking-tight
  text-fg` — e.g. the dashboard's "Welcome, {name}". One per page, above
  the fold. Marketing's hero clamp/4.5–8.5rem sizes are too large here;
  4xl is the product ceiling.
- **Eyebrow**: `font-mono text-[11px] uppercase tracking-[0.3em]
  text-gilt` — sits above a page title, same recipe as marketing's dark-band
  eyebrow (gilt, not ember — ember is reserved for actionable/interactive
  elements).
- **Section label** (table headers, form field labels, small chrome):
  `font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted`. Use
  `text-gilt` instead of `text-fg-muted` only when the label is itself a
  brand-flavored tag (e.g. the org chip), not for routine form labels.
- **Body**: default Inter, `text-sm` or `text-base` depending on density,
  `text-fg-muted` for secondary copy. No `parchment` yet in this pass —
  reserve it for planning/build passes if they need a warmer body tone.
- **Mono metadata**: `font-mono text-xs text-fg-muted` — session emails,
  timestamps, IDs. Unchanged from pre-restyle; already correct.

## Buttons

`buttonVariants` (`src/components/ui/button.tsx`) keeps its exact
exported API — `variant`/`size`/`className`, same variant names, same
sizes — only the class strings changed:

- Base: `font-mono uppercase tracking-[0.2em]`, square corners (no
  `rounded-*`), `active:scale-[0.97]`.
- `primary`: `bg-accent text-fg hover:bg-accent-strong` — ember fill,
  cream-toned text (using `fg`, which already reads as warm cream-white —
  no separate "cream" token was introduced for this).
- `secondary`: `border border-border-strong bg-transparent text-fg
  hover:border-accent hover:text-accent-strong` — hairline-weight
  functional border, transparent fill, ember on hover.
- `ghost`: text-only, `text-fg-muted hover:text-fg`, unchanged in spirit.
- Sizes shrank text (`text-sm`→`text-xs`, `text-[13px]`→`text-[11px]`) to
  fit the mono-uppercase treatment, which reads larger than sentence-case
  at the same font-size.

## Borders, cards, tags

- **Functional borders** (inputs, secondary buttons, dense component
  chrome): `border-border` / `border-border-strong`. These are not brand
  elements — leave them as-is in passes 2–3 unless a specific component
  needs emphasis.
- **Decorative/structural rules** (section dividers, header/footer
  hairlines, anything whose job is editorial rhythm, not function):
  `border-hairline` (gilt at 0.18 alpha). Used for the header's bottom
  border and the rule between the dashboard's welcome block and the idea
  intake section.
- **Tags/chips** that are brand-flavored (the org chip): square, `border
  border-gilt/40`, `text-gilt`, mono uppercase, small tracking. Not
  `rounded-full` — corners are square everywhere on this surface now.
- Corners are square across the whole product surface. No
  `rounded-*` on buttons, skeletons, tags, or cards. If you inherit a
  component with rounded corners from before this pass, square it when
  you touch that file.

## Forms

`Textarea` (`src/components/ui/textarea.tsx`) recipe — the pattern to
copy for any new form primitive:

```
transition-swift h-auto border border-border bg-transparent px-3.5 py-3
text-sm text-fg placeholder:text-fg-faint hover:border-border-strong
focus:border-ember focus:outline-none focus:ring-3 focus:ring-ember/20
```

Label: `font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted`.

This mirrors marketing's `Input` recipe (`apps/web/src/components/ui/input.tsx`)
adapted for dark: transparent background instead of cream, `border`
(functional) instead of `hairline-light`, `ember` focus instead of
marketing's `ember` focus (same token, this one just already lived in the
palette as `accent` too).

## Motion

Identical rules to marketing — same curve, same restraint — with two
named exceptions that are load-bearing product signals, not decoration:

- One easing curve everywhere: `cubic-bezier(0.22, 1, 0.36, 1)`. Never
  bare `ease`. Already centralized in `.transition-swift`.
- Hover transitions: 150–300ms, colors and transforms only.
- `animate-reveal` (opacity + translateY + blur, 600ms) for one-time
  entrances — unchanged.
- **`flash-once` and `pulse-glow` are the two intentional exceptions to
  "no loops"** documented in `globals.css`: `flash-once` is a one-shot
  highlight for "this just changed" (a revised diagram node, a new
  consistency flag); `pulse-glow` is a genuine loop, but only for the
  lifetime of an actually-running build task, kept low-amplitude so a
  graph with several running tasks doesn't turn into a light show. Both
  predate this pass and are explicitly out of scope to touch — they're
  functional state indicators, not brand flourish, and passes 2–3 should
  keep using them exactly as-is for their existing purposes.
- `prefers-reduced-motion` support is global and mandatory (already
  handled once in `globals.css` — don't re-implement per component).

## What passes 2–3 must follow

Planning (`components/planning/*`) and build (`components/build/*`)
restyle next. Decisions already locked by this pass that they inherit
automatically (via the shared tokens/primitives) or must match by hand:

- **Automatic** (no action needed, just don't fight it): `accent` is now
  ember everywhere — any existing `bg-accent`, `text-accent-strong`,
  `border-accent`, `ring-accent-soft`, `::selection`, scrollbar-hover
  usage already renders in brand. `Button`, `Skeleton`, `Textarea` are
  already restyled; components consuming them pick up square corners and
  brand focus states with zero changes to those component files.
- **Match by hand, same recipes as above**: page/section titles →
  `font-serif`; eyebrows and small brand-flavored labels → mono uppercase
  `text-gilt`; routine field/column labels → mono uppercase
  `text-fg-muted`; decorative dividers → `border-hairline`; functional
  dividers/input borders → `border-border` / `border-border-strong`; no
  `rounded-*` anywhere; ember only for interactive/actionable elements,
  gilt only for small non-interactive brand marks (never swap the two).
- **Do not touch**: `danger*`, `success*`, `node-datastore*`,
  `node-external*` — these encode state/kind, not brand.
- **Do not add**: a `cream` token (use `fg`, which already reads
  cream-toned on dark) or a light color-scheme — this app is
  intentionally dark-only, no `prefers-color-scheme` response.
- **Reuse, don't reinvent**: the `Textarea` focus recipe above is the
  template for any new build/planning input; the `Button` variants are
  the template for any new action — extend `VARIANTS`/`SIZES` in
  `ui/button.tsx` rather than hand-rolling one-off button classes in a
  planning/build component.

## File map

- Design tokens and motion CSS: `src/app/globals.css`
- Shared primitives: `src/components/ui/` (`button`, `skeleton`,
  `textarea` restyled this pass; other primitives in that folder are
  untouched and should be brought up to this system if passes 2–3 touch
  a component that uses them)
- App chrome: `src/components/nav/` (`app-sidebar`, `mobile-nav`, `account-menu`, `nav-items`), `src/components/mullion-mark.tsx`
- Dashboard home: `src/app/page.tsx`, `src/components/dashboard-skeleton.tsx`
- Product 404: `src/app/not-found.tsx`
- Not yet restyled (owned by passes 2–3): `src/components/planning/*`,
  `src/components/build/*`, and anything under `src/app/builds`,
  `src/app/sessions`
