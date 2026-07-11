import { Skeleton } from "./ui/skeleton";

// Mirrors the real dashboard's layout (heading + org chip + empty-state
// card) so there's no shape shift when the session resolves.
export function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-14">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-44" />
      <Skeleton className="mt-8 h-6 w-32 rounded-full" />
      <Skeleton className="mt-10 h-48 rounded-2xl" />
    </div>
  );
}
