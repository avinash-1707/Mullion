import { Skeleton } from "./ui/skeleton";

// Mirrors the real dashboard's layout (eyebrow + heading + org chip +
// intake section) so there's no shape shift when the session resolves.
// Slight rounding throughout, via Skeleton's own base treatment.
export function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16 lg:py-20">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-9 w-72" />
      <Skeleton className="mt-2 h-4 w-44" />
      <Skeleton className="mt-6 h-6 w-32" />
      <div className="mt-14 border-t border-hairline pt-14">
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
