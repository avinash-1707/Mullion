import { Skeleton } from "../ui/skeleton";

// Loading shapes for each of the three lifecycle looks — shown while the
// snapshot query is in flight, so there's no shape-shift once real data
// lands (CODING_STANDARDS §9).

export function RequirementsPhaseSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-24" />
      <div className="flex flex-col gap-3 border border-border bg-surface p-6">
        <Skeleton className="h-4 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="mt-2 h-4 w-56" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
    </div>
  );
}

export function ArchitecturePhaseSkeleton() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <Skeleton className="h-10 w-full" />
      <div className="flex flex-1 flex-col gap-4 lg:flex-row">
        <Skeleton className="h-80 flex-1 lg:h-auto" />
        <Skeleton className="h-64 lg:h-auto lg:w-[22rem]" />
      </div>
      <Skeleton className="h-14 w-full" />
    </div>
  );
}
