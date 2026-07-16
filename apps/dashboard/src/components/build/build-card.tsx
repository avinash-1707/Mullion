import Link from "next/link";
import type { BuildListItem, BuildStage } from "@mullion/schemas";
import { BuildStageBadge } from "./build-status-badge";
import { ChevronIcon } from "../planning/icons";
import { formatDateTime } from "../../lib/build-format";

// Pre-run stages live on the planning page; once a run exists the row jumps
// straight to it (ADR-83).
const PLANNING_STAGES: ReadonlySet<BuildStage> = new Set([
  "clarifying",
  "planning",
  "confirmed",
  "abandoned",
]);

function hrefFor(build: BuildListItem): string {
  if (!PLANNING_STAGES.has(build.stage) && build.latestRunId) {
    return `/builds/${build.latestRunId}`;
  }
  // Same pure-UX `phase` hint idea-intake-form.tsx sends after create: the
  // session page picks its loading skeleton from it before the snapshot
  // lands. Past clarifying, the session renders the architecture-shaped
  // layout (planning or the confirmed view), so without the hint the page
  // flashes the requirements skeleton first, then shape-shifts.
  const architectureShaped = build.stage === "planning" || build.stage === "confirmed";
  return `/sessions/${build.sessionId}${architectureShaped ? "?phase=architecture" : ""}`;
}

// Curated hue pairs for the card's generated cover, not an arbitrary
// combination of the palette's brand hues — pairing e.g. gilt with success
// (both warm yellow-green) reads muddy, so only combinations that actually
// harmonize against the dark ink base are listed. Each entry names two CSS
// custom properties straight from globals.css's `@theme` block rather than a
// hand-copied hex, so a future token restyle (à la ADR-76) carries through
// with zero changes here.
interface CoverRecipe {
  from: string;
  to: string;
}

const COVER_RECIPES: readonly CoverRecipe[] = [
  { from: "--color-ember", to: "--color-gilt" }, // sunset
  { from: "--color-node-datastore", to: "--color-node-external" }, // twilight
  { from: "--color-success", to: "--color-gilt" }, // verdigris-gold
  { from: "--color-node-external", to: "--color-ember" }, // dusk
  { from: "--color-node-datastore", to: "--color-success" }, // sea-glass
  { from: "--color-gilt", to: "--color-node-external" }, // regal
];

// FNV-1a over the build's id. Deterministic and pure so server render and
// client hydration always agree on the same cover — Math.random() would (a)
// mismatch between the two and (b) reshuffle a build's art on every refetch
// instead of it staying "this build's" cover for its whole lifetime.
function hashBuildId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Two radial blobs color-mixed toward the surface ink (not the raw brand
// hue) so the result stays "rich but low-key" instead of neon, laid over a
// diagonal ink sweep for depth. Every numeric range below reads a different
// slice of the same hash, so two builds that land on the same recipe still
// produce visibly different compositions instead of an identical repeat.
function coverStyle(buildId: string): { backgroundImage: string } {
  const hash = hashBuildId(buildId);
  // Safe without an undefined check: COVER_RECIPES is a fixed, non-empty
  // literal, so `% length` is always a valid index into it.
  const recipe = COVER_RECIPES[hash % COVER_RECIPES.length]!;
  const angle = 20 + ((hash >>> 4) % 140);
  const blob1X = 8 + ((hash >>> 8) % 38);
  const blob1Y = (hash >>> 12) % 35;
  const blob2X = 52 + ((hash >>> 16) % 42);
  const blob2Y = 40 + ((hash >>> 20) % 55);

  return {
    backgroundImage: [
      `radial-gradient(circle at ${blob1X}% ${blob1Y}%, color-mix(in srgb, var(${recipe.from}) 65%, var(--color-surface)) 0%, transparent 58%)`,
      `radial-gradient(circle at ${blob2X}% ${blob2Y}%, color-mix(in srgb, var(${recipe.to}) 60%, var(--color-surface)) 0%, transparent 62%)`,
      `linear-gradient(${angle}deg, var(--color-bg), var(--color-elevated))`,
    ].join(", "),
  };
}

interface BuildCardProps {
  build: BuildListItem;
}

export function BuildCard({ build }: BuildCardProps) {
  return (
    <Link
      href={hrefFor(build)}
      // hover:[transform:...] rather than hover:scale-[1.02]: Tailwind v4's
      // scale-* utilities emit the standalone `scale` property, which a
      // `transition-transform` property list never animates — same footgun
      // the confirm-dialog rules in globals.css document. And explicit
      // transition utilities rather than transition-swift: that class is
      // unlayered global CSS, so its 200ms would win the cascade over any
      // layered duration-* utility — this card wants 300ms.
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:[transform:scale(1.02)]"
    >
      {/* Cover — generated per build.id (see coverStyle above), not an image
          asset — gives every card a distinct identity in the grid the way a
          thumbnail would, with no artwork to source or store. */}
      <div className="relative h-28 w-full shrink-0 sm:h-32" style={coverStyle(build.id)}>
        {/* No backdrop chip behind the pill (owner call) — the pill's own
            tone fill sits directly on the cover. Soft tone bgs are
            semi-transparent, so legibility leans on the pill's border and
            the covers staying color-mixed toward surface (see coverStyle). */}
        <BuildStageBadge stage={build.stage} className="absolute right-2.5 top-2.5 rounded-full" />
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 py-3.5">
        <p className="line-clamp-2 text-sm text-fg">{build.idea}</p>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-fg-faint">{formatDateTime(build.createdAt)}</span>
          <ChevronIcon className="h-4 w-4 shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}
