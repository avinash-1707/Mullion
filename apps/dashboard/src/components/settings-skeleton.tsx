import { Skeleton } from "./ui/skeleton";

// Mirrors the real settings page's shape (eyebrow + heading + three
// section blocks) so there's no shape shift when the session resolves.
// Square throughout, matching the brand's no-rounded-corners rule.
export function SettingsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16 lg:py-20">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-9 w-40" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-14 border-t border-hairline pt-14">
        <Skeleton className="h-40 w-full" />
      </div>
      <div className="mt-14 border-t border-hairline pt-14">
        <Skeleton className="h-40 w-full" />
      </div>
      <div className="mt-14 border-t border-hairline pt-14">
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
