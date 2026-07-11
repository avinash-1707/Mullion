# Mullion design context

This file is the design memory for the marketing surface (landing, pricing, auth, 404). Read it before extending the UI so new pages look like they were designed in the same sitting. The signed-in product uses a separate dark palette and is not covered here.

## The brand idea

Mullion turns an idea into a shipped project. Every visual choice repeats that story: a gold wireframe (the idea, the plan) becoming a solid ultramarine form (the build). The logo is a cube mid-assembly. The hero statue holds a golden wireframe cube. Artwork dissolves into small square pixels at one edge, as if being compiled. Keep telling this story in new artwork and layouts.

The mood is editorial luxury: classical sculpture, museum typography, lots of quiet space. Think of a design annual, not a SaaS template.

## Palette

All tokens live in `src/app/globals.css` under `@theme`. Use tokens, never raw hex in components.

| Token | Value | Use |
|---|---|---|
| `cream` | #f2ecdd | Light band background, text on dark |
| `cream-deep` | #e9e1cc | Rarely, deeper cream surfaces |
| `ink` | #08080d | Dark band background, headings on cream |
| `ink-soft` | #10101a | Cards on dark bands |
| `ink-muted` | #57503f | Body text on cream |
| `ink-faint` | #7d7663 | Faint text on cream, disabled marks |
| `ultra` / `ultra-deep` | #2e3fa3 / #1b2a6b | The statue blue, rarely as UI color |
| `ember` | #c4552a | The accent: CTAs, highlighted words, links |
| `ember-strong` | #d96b3d | Ember hover state |
| `gilt` | #c99b2e | Gold: eyebrows on dark, icons, rings, tags |
| `parchment` | cream at 72% | Body text on dark |
| `parchment-faint` | cream at 44% | Secondary text on dark |
| `hairline-light` | ink at 14% | Rules and borders on cream |
| `hairline-dark` | gilt at 22% | Rules and borders on dark |

Rules of thumb:
- Cream and ink bands alternate down the page. Never two dark bands touching.
- Ember is scarce. One highlighted phrase per heading, one primary button per view.
- Gold is for small things: eyebrows, icons, thin rings, tags. Never large fills.

## Typography

Three faces, loaded in `src/app/layout.tsx`:

- `font-serif` (Fraunces, with optical sizing): every heading and display number. Headings are weight normal, never bold.
- `font-display` (Archivo, the default body font): paragraphs, UI text.
- `font-mono` (JetBrains Mono): eyebrows, labels, buttons, small metadata. Always uppercase with wide tracking.

Recurring type recipes (copy these class strings):

- Eyebrow: `font-mono text-[11px] uppercase tracking-[0.3em] text-ember` (use `text-gilt` on dark bands)
- Section heading: `font-serif text-4xl leading-tight sm:text-5xl` with `text-ember` on cream, `text-cream` on dark. Highlight one phrase with `<span className="text-ember">`
- Hero-scale heading: `font-serif text-[clamp(4rem,9vw,7.5rem)] leading-[0.95] tracking-tight`
- Body: `text-base leading-relaxed` in `text-ink-muted` (cream) or `text-parchment` (dark), capped with `max-w-md` or similar
- Small label / column header: `font-mono text-[10px] uppercase tracking-[0.3em]`
- Chapter mark: small mono "Chapter" over a `font-serif text-5xl text-ember` number. Component: `src/components/landing/chapter-mark.tsx`

Copy voice: plain language, short sentences, no jargon, no em dashes. Periods do the work. Headlines are confident statements, often two sentences ("Four steps. One clear path.").

## Layout

- Content container: `mx-auto w-full max-w-[1200px] px-6 sm:px-10`
- Band padding: `py-28 lg:py-36`. Generous space is part of the look; when in doubt add more.
- Sections alternate cream and ink. Dark band: `bg-ink text-cream`.
- Chapter sections use a 12-column grid: 2 cols for the chapter mark, 4 for artwork, 6 for text (`grid lg:grid-cols-12 lg:gap-10`).
- Hairline rules structure everything: `border-t border-hairline-light` on cream, `border-hairline-dark` on dark. Column dividers via `lg:divide-x lg:divide-hairline-light`.
- Corners are square. No rounded cards or buttons on the marketing surface (the arch frame and checkbox 2px radius are the only exceptions).

## Recurring elements

- Primary button: `bg-ember px-8 py-4 font-mono text-xs uppercase tracking-[0.2em] text-cream transition-[background-color,transform] duration-200 hover:bg-ember-strong active:scale-[0.97]`. On cream the hero variant uses `bg-ink ... hover:bg-ember`.
- Outline button (dark bands): `border border-hairline-dark ... hover:border-ember hover:bg-ember`
- Text link with arrow: group link, mono uppercase, arrow span gets `transition-transform duration-200 group-hover:translate-x-1`
- Framed artwork: thin border wrapper with `p-3` gap, image inside. Arch frame: `rounded-t-[999px]` on both wrapper and image container. Square frame: no radius.
- Unframed artwork on dark bands: let the near-black image ground melt into the band; feather edges with `[mask-image:radial-gradient(...)]` if a rectangle edge shows.
- Card hover: `transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1`, image inside scales `group-hover:scale-[1.04]` at 500ms.
- Quote block: `border-l-2 border-gilt pl-6`, serif italic, mono cite.
- Vertical tagline: `[writing-mode:vertical-rl]` mono gilt, "Idea meets execution".

## Motion

The full rationale lives with the components; the rules:

- One easing curve everywhere: `cubic-bezier(0.22, 1, 0.36, 1)`. Never bare `ease`.
- Scroll reveals use the `Reveal` component (`src/components/landing/reveal.tsx`): opacity + translateY(18px) + blur(8px), 700ms, staggered siblings by ~90ms via the `delay` prop. `variant="art"` adds a slight settle-down scale for imagery.
- Above-the-fold content uses the CSS `animate-reveal` keyframes with `animationDelay` stagger instead (no observer needed).
- Hover transitions: 150 to 300ms, colors and transforms only. Never animate width, height, or position.
- FAQ-style expanding panels: grid-template-rows 0fr to 1fr (`.lp-faq-panel` in globals.css).
- Lenis drives smooth scrolling on the marketing surface (`SmoothScroll` in the marketing layout). Anchors need `/#id` hrefs and get a -40px offset.
- No looping animations, no parallax, no attention-seeking pulses.
- `prefers-reduced-motion` support is mandatory and global (globals.css collapses everything; Lenis disables itself).

## Forms

shadcn components restyled to the brand live in `src/components/ui/`: `input`, `label`, `checkbox`, `separator`. Recipes:

- Input: h-12, square corners, transparent background, `border-hairline-light`, ember focus ring
- Label: mono 11px uppercase `tracking-[0.2em] text-ink-muted`
- Checkbox: fills ember when checked
- Errors: `border-l-2 border-ember bg-ember/10 px-4 py-3 text-sm text-ember`

Auth pages use the `AuthShell` split (artwork left, cream form right): `src/components/auth/auth-shell.tsx`.

## Imagery

Art direction DNA (bake all of it into every generation prompt):

- Classical Renaissance marble sculpture rendered in deep ultramarine cobalt blue (#1B2A6B to #2E3FA3), matte texture, no skin tones
- Gold (#C9A227) for glowing objects, thin vector-like circular line rings, wireframes
- One edge disintegrating into small square pixels (2 to 6 px scale), a few tiny burnt-orange (#C4552A) pixel squares drifting
- Backgrounds: warm cream ivory (#F2EDE4) for light-band images, solid near-black (#08080D) for dark-band images so they melt into the band
- Dramatic chiaroscuro, single light source, editorial luxury aesthetic, 8k
- Always end prompts with: no text, no letters, no watermark, no signature

Workflow: generate PNG, convert with `convert in.png -quality 82 out.webp`, delete the PNG. Organize by page: `public/landing/`, `public/auth/`, `public/brand/`. Brand assets (`logo.png` master, `logo-mark.png` trimmed square, `og.png`) stay in `public/brand/`.

## Metadata

New public pages get `createMetadata({ title, description, path })` from `src/config/metadata.ts` and an entry in `src/app/sitemap.ts`. Private pages pass `noIndex: true`.

## File map

- `src/app/(marketing)/` route group: landing, pricing, auth pages
- `src/components/landing/` one component per section, data arrays at the top of each file
- `src/components/auth/` auth shell and forms
- `src/components/landing/reveal.tsx`, `smooth-scroll.tsx`, `chapter-mark.tsx` are the shared primitives
- Design tokens and motion CSS: `src/app/globals.css`
