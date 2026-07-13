import { Skeleton } from "@/components/ui/skeleton";

// One skeleton per settings tab, shaped to that tab's real layout, shown
// by a single per-tab pending gate — so a tab paints all at once instead
// of static headings appearing first and each widget's placeholder
// popping in behind them.

export function HeadingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-4 w-full max-w-xs" />
    </div>
  );
}

export function ProfileTabSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-6">
        <HeadingSkeleton />
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </div>
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      <div className="flex flex-col gap-6 border-t border-hairline pt-14">
        <HeadingSkeleton />
        <Skeleton className="h-40 w-full" />
      </div>
      <div className="flex flex-col gap-6 border-t border-hairline pt-14">
        <HeadingSkeleton />
        <Skeleton className="h-40 w-full" />
      </div>
    </>
  );
}

export function MembersTabSkeleton() {
  return (
    <div className="flex flex-col gap-14">
      <div className="flex flex-col gap-6">
        <HeadingSkeleton />
        <Skeleton className="h-9 w-full max-w-sm" />
      </div>
      <div className="flex flex-col gap-6 border-t border-hairline pt-14">
        <HeadingSkeleton />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
      <div className="flex flex-col gap-6 border-t border-hairline pt-14">
        <HeadingSkeleton />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}

export function ModelsTabSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <HeadingSkeleton />
      <Skeleton className="h-32 w-full" />
      <div className="flex flex-col gap-5 border-t border-hairline pt-6">
        <Skeleton className="h-16 w-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    </div>
  );
}

export function AnalyticsTabSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <HeadingSkeleton />
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
