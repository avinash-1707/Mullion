"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { buildListPageSchema } from "@mullion/schemas";
import { authClient } from "@/lib/auth-client";
import { redirectToSignIn } from "@/lib/auth-redirect";
import { apiFetch } from "@/lib/api";
import { BuildListSkeleton, BuildCardSkeleton } from "@/components/build/build-skeletons";
import { SessionErrorState } from "@/components/planning/session-error-state";
import { BuildCard } from "@/components/build/build-card";
import { BuildIcon } from "@/components/planning/icons";
import { buttonVariants } from "@/components/ui/button";

export default function BuildsPage() {
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) redirectToSignIn();
  }, [isPending, session]);

  // Cursor-paginated walk of the org's builds (ADR-77/83): one row per idea
  // whatever its stage — planning, running, or finished — so no second
  // sessions query (ADR-82's union is superseded). Each page carries an
  // opaque nextCursor; null means the end.
  const buildsQuery = useInfiniteQuery({
    queryKey: ["builds", "list"],
    queryFn: async ({ pageParam }) =>
      buildListPageSchema.parse(
        await apiFetch(`/api/builds${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(session),
  });

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = buildsQuery;
  const pageCount = buildsQuery.data?.pages.length ?? 0;

  // Infinite scroll: a sentinel below the list fetches the next page as it
  // approaches the viewport. The "Load more" button stays as the manual
  // fallback — the observer just presses it automatically.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          // cancelRefetch: false — a re-fire while a page is already in
          // flight must not cancel and restart that request.
          void fetchNextPage({ cancelRefetch: false });
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // pageCount re-attaches the observer after each page lands — if a short
    // page leaves the sentinel already inside the margin, no intersection
    // TRANSITION would ever fire again; re-observing re-emits the initial
    // state and keeps the auto-load going.
  }, [hasNextPage, fetchNextPage, pageCount]);

  // One skeleton for both waits (auth resolving, then the list query) — a
  // different placeholder per wait reads as a flash of the wrong page.
  if (isPending || !session || buildsQuery.isLoading) {
    return <BuildListSkeleton />;
  }

  if (buildsQuery.isError) {
    return <SessionErrorState title="Couldn't load builds" message={buildsQuery.error.message} />;
  }

  const builds = buildsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-14">
      <div>
        <h1 className="font-serif text-4xl leading-tight tracking-tight text-fg">Builds</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Everything your organization is planning or building, newest first.
        </p>
      </div>

      {builds.length === 0 ? (
        // Same quiet empty state as settings' analytics tab: faint icon,
        // serif line, muted sub-line — no card chrome. min-h + justify-center
        // so it sits centered in the viewport area below the header, not
        // hugging it.
        <div className="animate-reveal flex min-h-[55vh] flex-col items-center justify-center px-5 py-14 text-center">
          <BuildIcon className="h-8 w-8 text-fg-faint" />
          <p className="mt-4 font-serif text-xl text-fg">No builds yet.</p>
          <p className="mt-2 max-w-sm text-sm text-fg-muted">
            Every build starts from an idea - submit one from the dashboard to begin planning.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {builds.map((build) => (
              <BuildCard key={build.id} build={build} />
            ))}
            {isFetchingNextPage &&
              [0, 1, 2].map((i) => <BuildCardSkeleton key={`next-page-${i}`} />)}
          </div>

          <div ref={sentinelRef} aria-hidden="true" />

          {hasNextPage && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => void fetchNextPage({ cancelRefetch: false })}
                disabled={isFetchingNextPage}
                className={buttonVariants({
                  variant: "secondary",
                  size: "sm",
                  className: "disabled:pointer-events-none disabled:opacity-60",
                })}
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
