import { Skeleton } from "./ui/skeleton";

// Mirrors the real settings page's shape (tab row + panel body — the page
// heading was dropped; the tab list is the page's top element now) so
// there's no shape shift when the session resolves. Width matches
// SettingsTabs' container (max-w-3xl, widened from the pre-tabs max-w-2xl
// to fit the Models/Analytics tabs' wider content). Slight rounding
// throughout, via Skeleton's own base treatment.
export function SettingsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-16 pt-8 lg:pb-20 lg:pt-10">
      <div className="flex gap-1 border-b border-border pb-3">
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
