"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { buildRunListPageSchema, planningSessionListSchema } from "@mullion/schemas";
import { authClient } from "@/lib/auth-client";
import { redirectToSignIn } from "@/lib/auth-redirect";
import { apiFetch } from "@/lib/api";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { BuildListSkeleton } from "@/components/build/build-skeletons";
import { SessionErrorState } from "@/components/planning/session-error-state";
import { BuildListRow } from "@/components/build/build-list-row";
import { PlanningSessionRow } from "@/components/planning/planning-session-row";
import { BuildIcon } from "@/components/planning/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";

export default function BuildsPage() {
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) redirectToSignIn();
  }, [isPending, session]);

  // Cursor-paginated walk of the org's runs (ADR-77): each page carries an
  // opaque nextCursor; null means the end.
  const runsQuery = useInfiniteQuery({
    queryKey: ["builds", "list"],
    queryFn: async ({ pageParam }) =>
      buildRunListPageSchema.parse(
        await apiFetch(`/api/builds${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(session),
  });

  // Sessions still in clarification/planning live in planning_sessions, not
  // runs — surfaced here so in-flight work is visible before a run exists.
  // Supplemental: its loading/error states never block the runs list.
  const sessionsQuery = useQuery({
    queryKey: ["sessions", "active"],
    queryFn: async () => planningSessionListSchema.parse(await apiFetch("/api/sessions")),
    enabled: Boolean(session),
  });

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = runsQuery;
  const pageCount = runsQuery.data?.pages.length ?? 0;

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

  if (isPending || !session) {
    return <DashboardSkeleton />;
  }

  if (runsQuery.isLoading) {
    return <BuildListSkeleton />;
  }

  if (runsQuery.isError) {
    return <SessionErrorState title="Couldn't load builds" message={runsQuery.error.message} />;
  }

  const runs = runsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const planningSessions = sessionsQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">Builds</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight text-fg">Build runs</h1>
          <p className="mt-2 text-sm text-fg-muted">Your organization&apos;s build runs, newest first.</p>
        </div>
        <Link href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          ← Dashboard
        </Link>
      </div>

      {planningSessions.length > 0 && (
        <div className="mt-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint">
            In planning
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            {planningSessions.map((planningSession) => (
              <PlanningSessionRow key={planningSession.id} session={planningSession} />
            ))}
          </div>
        </div>
      )}

      {runs.length === 0 ? (
        planningSessions.length === 0 && (
          // Same quiet empty state as settings' analytics tab: faint icon,
          // serif line, muted sub-line — no card chrome. min-h + justify-center
          // so it sits centered in the viewport area below the header, not
          // hugging it.
          <div className="animate-reveal flex min-h-[55vh] flex-col items-center justify-center px-5 py-14 text-center">
            <BuildIcon className="h-8 w-8 text-fg-faint" />
            <p className="mt-4 font-serif text-xl text-fg">No builds yet.</p>
            <p className="mt-2 max-w-sm text-sm text-fg-muted">
              Builds start from a confirmed planning session - freeze an architecture, then choose &ldquo;Build it for us.&rdquo;
            </p>
          </div>
        )
      ) : (
        <>
          {planningSessions.length > 0 && (
            <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint">
              Runs
            </p>
          )}
          <div className={`${planningSessions.length > 0 ? "mt-3" : "mt-8"} flex flex-col gap-2.5`}>
            {runs.map((run) => (
              <BuildListRow key={run.id} run={run} />
            ))}
            {isFetchingNextPage &&
              [0, 1, 2].map((i) => <Skeleton key={`next-page-${i}`} className="h-16" />)}
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
