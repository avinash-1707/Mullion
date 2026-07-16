import { Skeleton } from "../ui/skeleton";

// Loading shapes for each of the three lifecycle looks — shown while the
// snapshot query is in flight, so there's no shape-shift once real data
// lands (CODING_STANDARDS §9). Each skeleton stands in for the page's whole
// loaded tree, not just the phase body: session-skeletons.tsx renders
// *instead of* SessionHeader + phase, so the header shell is mirrored here
// too (see sessions/[id]/page.tsx). AgentStatusStrip and the "resumed"/
// view-only banners are conditionally-rendered slivers that contribute zero
// height in the common case (idle agent, creator viewing their own session)
// — reserving space for them here would itself be the shape-shift, so they're
// intentionally left out.

export function RequirementsPhaseSkeleton() {
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

      {/* Mirrors RequirementsPhase: its own scroll column, the idea recap
          box, then the heaviest likely first paint — a pending question
          round card with a few chip rows and a trailing submit button. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
          <div className="border border-dashed border-border-strong px-5 py-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-4 w-full" />
          </div>

          <div className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-6">
            <Skeleton className="h-3 w-24" />

            {/* Each option below is a bordered chip (chipClass: rounded-md
                border px-4 py-2), not a filled block — framed the same way
                rather than a flat Skeleton standing in for a border. */}
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-64" />
              <div className="flex flex-wrap gap-2">
                <div className="rounded-md border border-border-strong px-4 py-2">
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="rounded-md border border-border-strong px-4 py-2">
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="rounded-md border border-border-strong px-4 py-2">
                  <Skeleton className="h-4 w-24" />
                </div>
                <div className="rounded-md border border-border-strong px-4 py-2">
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-56" />
              <div className="flex flex-wrap gap-2">
                <div className="rounded-md border border-border-strong px-4 py-2">
                  <Skeleton className="h-4 w-16" />
                </div>
                <div className="rounded-md border border-border-strong px-4 py-2">
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="rounded-md border border-border-strong px-4 py-2">
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Skeleton className="h-11 w-32 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ArchitecturePhaseSkeleton() {
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

      {/* Mirrors ArchitecturePhase: consistency toolbar, the mobile-only tab
          row, then the diagram/decision-log split with the edit bar pinned
          under the log. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 border border-border-strong bg-surface px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-11 w-44 shrink-0 rounded-md" />
          </div>
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
          {/* Diagram pane — always visible; "diagram" is the phase's default
              active mobile tab, so no `hidden` class is needed here. */}
          <div className="min-h-[22rem] flex-1 lg:min-h-0">
            {/* Mirrors ArchitectureDiagram's own frame (border border-border
                bg-bg) — the canvas fill sits inset inside it, not as a flat
                blob standing in for the bordered pane itself. */}
            <div className="relative h-full min-h-[22rem] w-full overflow-hidden border border-border bg-bg lg:min-h-0">
              <Skeleton className="absolute inset-2 rounded-sm" />
              <div className="absolute left-3 top-3 z-10 flex gap-2 border border-border bg-surface px-3 py-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
          </div>

          {/* Decision log + edit bar — hidden below `lg` until the "log" tab
              is chosen, same default-visibility split the real component
              starts in. */}
          <div className="hidden min-h-[18rem] flex-1 flex-col gap-3 lg:flex lg:min-h-0 lg:w-[23rem] lg:flex-none">
            <div className="min-h-0 flex-1">
              <div className="flex h-full min-h-0 flex-col border border-border bg-bg">
                <div className="shrink-0 border-b border-border px-4 py-3">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="mt-1.5 h-3 w-44" />
                </div>
                {/* Mirrors DecisionRow: actor chip (rounded-full pill) +
                    timestamp, then the decision text — divided by the same
                    border-b DecisionRow itself uses, not a flat card. */}
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex flex-col gap-1.5 border-b border-hairline pb-3 last:border-b-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-1 rounded-full border border-border-strong px-2 py-0.5">
                          <Skeleton className="h-2.5 w-2.5 rounded-full" />
                          <Skeleton className="h-2.5 w-14" />
                        </div>
                        <Skeleton className="h-2.5 w-8" />
                      </div>
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Pinned below the log, in its own row — matches EditPromptBar's
                own placement, never overlapping log entries. */}
            <div className="shrink-0">
              <div className="flex items-end gap-2.5 rounded-lg border border-border-strong bg-surface p-2.5">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-9 w-16 shrink-0 rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
