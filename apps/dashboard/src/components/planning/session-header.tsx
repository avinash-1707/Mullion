import Link from "next/link";

const PHASE_LABEL: Record<string, string> = {
  requirements: "Clarifying requirements",
  architecture: "Planning architecture",
};

// Sticky top bar for a planning session: an icon-only back control, the
// build's idea, and the current step. Fixed at top (sticky) so its space
// always belongs to the header while the phase content scrolls underneath.
export function SessionHeader({ idea, phase, isConfirmed }: { idea: string; phase: string; isConfirmed: boolean }) {
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-bg px-4 py-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          aria-label="Back to dashboard"
          className="transition-swift flex size-8 shrink-0 items-center justify-center rounded-md bg-elevated text-fg-muted hover:text-fg"
        >
          ←
        </Link>
        <span className="min-w-0 truncate text-sm text-fg">
          <span className="text-fg-faint">Build:</span> {idea}
        </span>
      </div>
      {!isConfirmed ? (
        <span className="shrink-0 rounded-full bg-elevated px-3 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-fg-muted">
          <span className="text-fg-faint">Step:</span> {PHASE_LABEL[phase] ?? phase}
        </span>
      ) : null}
    </div>
  );
}
