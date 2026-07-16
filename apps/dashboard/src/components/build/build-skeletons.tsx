import { Skeleton } from "../ui/skeleton";

// Loading shapes shown while the initial run/task queries are in flight —
// mirrors the final layout so there's no shape-shift once real data lands
// (CODING_STANDARDS §9), same approach as planning/session-skeletons.tsx.

// Stands in for the run page's *whole* loaded tree, not just a body region —
// builds/[id]/page.tsx renders this instead of the BuildRunHeader/tabs/panes
// return during auth-pending, unauthorized, and run-fetch waits alike, so
// every one of those wrappers is mirrored here too (same reasoning as
// planning/session-skeletons.tsx). Reserves space only for what's visible at
// the page's *default* first paint — activeTab "tasks", tasksView "list" —
// and respects the same mobile-vs-desktop visibility the real tabs start in,
// so switching tabs never has to fight a skeleton shaped for a different
// state. The escalation gate and delivery panel are conditional/terminal-only
// (no active escalation, run not yet finished, on a fresh load) and
// BuildAgentGraph is a click away behind the list/graph toggle — reserving
// space for any of them here would itself be the shape-shift on the common
// "run in progress" load, so they're deliberately left out.
export function BuildRunSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Mirrors BuildRunHeader: back link + short id, "Build run" title
          with its icon, started timestamp, status badge trailing. */}
      <div className="border-b border-hairline px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
              <Skeleton className="h-6 w-28" />
            </div>
            <Skeleton className="mt-1 h-3 w-36" />
          </div>
          {/* StatusPill is a bordered chip (border + dot + label), not a
              filled block — framed here the same way, not a flat blob. */}
          <div className="inline-flex h-7 shrink-0 items-center gap-1.5 border border-border-strong bg-surface px-3 py-1">
            <Skeleton className="h-1.5 w-1.5 rounded-full" />
            <Skeleton className="h-2.5 w-14" />
          </div>
        </div>
      </div>

      {/* Mirrors the mobile-only "Build panes" tab row — hidden at lg, same
          as the real one it stands in for. */}
      <div className="flex border-b border-border lg:hidden">
        <div className="flex-1 px-4 py-2.5">
          <Skeleton className="h-4 w-11" />
        </div>
        <div className="flex-1 px-4 py-2.5">
          <Skeleton className="h-4 w-16" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6 lg:flex-row">
        {/* Tasks pane — activeTab "tasks" is the default, so unlike the
            timeline pane below it carries no `hidden` class on mobile. */}
        <div className="flex min-h-[20rem] flex-1 flex-col gap-3">
          <div className="flex shrink-0 justify-end">
            <div className="inline-flex items-center border border-border bg-surface">
              <div className="px-3 py-1.5">
                <Skeleton className="h-3 w-8" />
              </div>
              <div className="px-3 py-1.5">
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
          </div>
          {/* Mirrors BuildTaskList, the default tasksView "list" pane: header
              block, then a few task rows (BuildTaskRow's id chip + status
              pill line, description lines). */}
          <div className="min-h-0 flex-1">
            <div className="flex h-full min-h-0 flex-col border border-border bg-bg">
              <div className="shrink-0 border-b border-border px-4 py-3">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="mt-1.5 h-3 w-44" />
              </div>
              <div className="flex min-h-0 flex-1 flex-col divide-y divide-hairline overflow-y-auto">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex flex-col gap-2.5 px-4 py-3.5">
                    <div className="flex items-center justify-between gap-2">
                      {/* specTaskId chip: bg-elevated, no border — a flat
                          Skeleton already matches its real shape. */}
                      <Skeleton className="h-4 w-20" />
                      {/* TaskStatusPill: bordered chip, framed like the
                          header's status badge above. */}
                      <div className="inline-flex items-center gap-1.5 border border-border-strong bg-surface px-2 py-0.5">
                        <Skeleton className="h-1.5 w-1.5 rounded-full" />
                        <Skeleton className="h-2.5 w-10" />
                      </div>
                    </div>
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-2/3" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Timeline pane — hidden below `lg` until the "timeline" tab is
            chosen, same default-visibility split the real page starts in. */}
        <div className="hidden min-h-[18rem] lg:block lg:w-[24rem] lg:shrink-0">
          <div className="flex h-full min-h-0 flex-col border border-border bg-bg">
            <div className="shrink-0 border-b border-border px-4 py-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-1.5 h-3 w-52" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
              <div className="ml-1 flex flex-col border-l border-hairline">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="relative border-b border-hairline py-2.5 pl-4 last:border-b-0">
                    <span
                      className="absolute left-0 top-3.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-fg-faint"
                      aria-hidden="true"
                    />
                    {/* Most row kinds (task/escalation/review/delivery) render
                        as a bordered card, not a plain line — framed here to
                        match rather than a flat blob on the spine. */}
                    <div className="flex items-start gap-2.5 border border-border bg-surface px-3.5 py-2.5">
                      <Skeleton className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm" />
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-10" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mirrors BuildCard's cover/idea/footer shape (build-card.tsx) so the
// loading state never shape-shifts into the real card grid once data lands
// (CODING_STANDARDS §9). Exported so the /builds page's own inline
// "next page loading" placeholders — shown below an already-settled list
// while a further page streams in — use this exact shape too, rather than a
// hand-rolled approximation drifting out of sync with it.
export function BuildCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <Skeleton className="h-28 w-full sm:h-32" />
      <div className="flex flex-1 flex-col gap-3 px-4 py-3.5">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-3" />
        </div>
      </div>
    </div>
  );
}

export function BuildListSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-6 py-14">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="mt-1 h-4 w-64" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <BuildCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
