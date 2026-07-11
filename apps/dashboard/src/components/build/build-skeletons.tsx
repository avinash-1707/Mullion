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

export function BuildListSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-6 py-14">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="mt-2 h-8 w-48" />
      <Skeleton className="mt-1 h-4 w-64" />
      <div className="mt-6 flex flex-col gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </div>
  );
}
