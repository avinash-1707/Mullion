import { Skeleton } from "./ui/skeleton";

// Mirrors the real settings page's shape (eyebrow + heading + tab row +
// panel body) so there's no shape shift when the session resolves. Width
// matches SettingsTabs' container (max-w-3xl, widened from the pre-tabs
// max-w-2xl to fit the Models/Analytics tabs' wider content). Slight
// rounding throughout, via Skeleton's own base treatment.
export function SettingsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16 lg:py-20">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-3 h-9 w-40" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-14 flex gap-1 border-b border-border pb-3">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="pt-14">
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
