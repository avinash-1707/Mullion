import { Skeleton } from "../ui/skeleton";

// One loading shape for both planning phases, shown while the snapshot
// query is in flight (CODING_STANDARDS §9). RequirementsPhase and
// ArchitecturePhase now render the exact same outer chrome — top strip slot,
// mobile-only tab row, main+side pane split — so a single skeleton fits
// whichever phase the session turns out to be in, instead of guessing from
// a `?phase=` URL hint that a plain reload never carries (the bug that
// motivated this collapse — see sessions/[id]/page.tsx). Mirrors the page's
// whole loaded tree, not just the phase body: this renders *instead of*
// SessionHeader + phase, so the header shell is reproduced here too.
// AgentStatusStrip and the "resumed"/view-only banners are conditionally-
// rendered slivers that contribute zero height in the common case (idle
// agent, creator viewing their own session) — reserving space for them here
// would itself be the shape-shift, so they're intentionally left out.
//
// Placeholders are flat Skeleton blocks only — no borders, even where the
// real pane is bordered (user directive). The skeleton's job is the layout's
// silhouette; outlined empty boxes read as broken chrome, not loading.
export function PlanningPhaseSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Mirrors SessionHeader: back control, idea line, phase pill. */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-bg px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-5 w-40 shrink-0 rounded-full" />
      </div>

      {/* Mirrors the shared phase chrome: top strip slot, mobile-only tab
          row, then the main/side pane split. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-4 py-3 sm:px-6">
          {/* Same vertical footprint as the real strip's single-line common
              case (py-3.5 box + one text line), as one flat block. */}
          <Skeleton className="h-12 w-full" />
        </div>

        <div className="flex border-b border-border lg:hidden">
          <div className="flex-1 px-4 py-2.5">
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="flex-1 px-4 py-2.5">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6 lg:flex-row lg:overflow-hidden">
          {/* Main pane — the diagram canvas, the working loader, a question
              card, or the requirements doc all land here; one flat fill
              stands in for whichever resolves. Always visible; the main
              pane is the default active tab on both phases. */}
          <div className="min-h-[22rem] flex-1 lg:min-h-0">
            <Skeleton className="h-full min-h-[22rem] w-full lg:min-h-0" />
          </div>

          {/* Side pane — the decision log, or the idea/answers history;
              hidden below `lg` until its mobile tab is chosen, same
              default-visibility split both real components start in. */}
          <div className="hidden min-h-[18rem] flex-1 flex-col gap-3 lg:flex lg:min-h-0 lg:w-[23rem] lg:flex-none">
            <div className="flex h-full min-h-0 flex-col gap-3">
              <Skeleton className="h-20 w-full shrink-0" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
