import { Skeleton } from "./ui/skeleton";

// Mirrors the hero page's shape (headline block + card-height block, same
// vh-based offsets as src/app/page.tsx) so there's no shape shift when the
// session resolves. No image here on purpose - a pulsing placeholder for
// the artwork would read as broken, not loading.
export function DashboardSkeleton() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh_-_4rem)] w-full max-w-2xl flex-col items-center px-6 pt-[32vh] lg:min-h-[100dvh]">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-4 h-9 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-56 max-w-full" />
      <Skeleton className="mt-[6vh] h-72 w-full" />
    </div>
  );
}
