import { Skeleton } from "../ui/skeleton";

// Loading shapes shown while the initial run/task queries are in flight —
// mirrors the final layout so there's no shape-shift once real data lands
// (CODING_STANDARDS §9), same approach as planning/session-skeletons.tsx.

export function BuildRunSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-7 w-24" />
      </div>
      <div className="flex flex-1 flex-col gap-4 lg:flex-row">
        <Skeleton className="h-64 flex-1 lg:h-auto" />
        <Skeleton className="h-64 lg:h-auto lg:w-[24rem]" />
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
