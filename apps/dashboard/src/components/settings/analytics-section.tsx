"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useAnalyticsQuery } from "@/hooks/use-analytics";
import { useAnalyticsRunsQuery } from "@/hooks/use-analytics-runs";
import { StatTile } from "./stat-tile";
import { RoleCostBars } from "./role-cost-bars";
import { SpendSparkline } from "./spend-sparkline";
import { FormNote } from "./form-note";
import { AnalyticsRunRow, RUN_ROW_DESKTOP_GRID } from "./analytics-run-row";
import { ChartIcon } from "@/components/planning/icons";
import { formatCompactNumber, formatUsd } from "@/lib/format";
import { medianOf } from "@/lib/median";
import type { AnalyticsResponse } from "@/lib/settings-api";
import { AnalyticsTabSkeleton } from "./tab-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";

export function AnalyticsSection() {
  const analytics = useAnalyticsQuery();
  const data = analytics.data;

  // Whole-tab gate — heading included, so nothing paints before the data.
  if (analytics.isPending) {
    return <AnalyticsTabSkeleton />;
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl leading-snug tracking-tight text-fg">Usage &amp; spend</h2>
        <p className="mt-1 text-sm text-fg-muted">LLM usage across every role, last {data?.days ?? 30} days.</p>
      </div>

      {data ? (
        <AnalyticsContent data={data} />
      ) : analytics.error ? (
        <FormNote>{analytics.error.message}</FormNote>
      ) : null}
    </section>
  );
}

function AnalyticsContent({ data }: { data: AnalyticsResponse }) {
  const isEmpty = data.totals.llmCalls === 0;

  if (isEmpty) {
    return (
      // min-h + justify-center so the empty state sits centered in the
      // panel's viewport area, not hugging the tab row.
      <div className="animate-reveal flex min-h-[45vh] flex-col items-center justify-center px-5 py-14 text-center">
        <ChartIcon className="h-8 w-8 text-fg-faint" />
        <p className="mt-4 font-serif text-xl text-fg">Nothing spent yet.</p>
        <p className="mt-2 text-sm text-fg-muted">Start a build to see usage here.</p>
      </div>
    );
  }

  const totalTokens = data.totals.promptTokens + data.totals.completionTokens;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="Total tokens" value={formatCompactNumber(totalTokens)} />
          <StatTile label="Total cost" value={formatUsd(data.totals.costUsd)} />
          <StatTile label="LLM calls" value={formatCompactNumber(data.totals.llmCalls)} />
        </div>
        {data.totals.byokCostUsd > 0 ? (
          <p className="font-mono text-xs text-fg-faint">
            {formatUsd(data.totals.byokCostUsd)} of that ran on your own key.
          </p>
        ) : null}
      </div>

      <div>
        <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">Cost by role</h3>
        <div className="mt-4">
          <RoleCostBars roles={data.byRole} />
        </div>
      </div>

      <div>
        <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">Daily spend</h3>
        <div className="mt-4">
          <SpendSparkline data={data.byDay} />
        </div>
      </div>

      <div>
        <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
          Per-run spend · last 30 days
        </h3>
        <div className="mt-4">
          <PerRunSpend />
        </div>
      </div>
    </div>
  );
}

function PerRunSpend() {
  const runsQuery = useAnalyticsRunsQuery();
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = runsQuery;

  const runs = useMemo(() => runsQuery.data?.pages.flatMap((page) => page.items) ?? [], [runsQuery.data]);
  // Median-based outlier cue: a run costing more than 2x the median of
  // every row currently fetched (all loaded pages) gets flagged, so a
  // runaway build stands out without a fixed dollar threshold going stale.
  const outlierThreshold = useMemo(() => medianOf(runs.map((run) => run.costUsd)) * 2, [runs]);

  // Infinite scroll, mirroring app/builds/page.tsx's sentinel pattern — a
  // zero-height marker just below the list fetches the next page as it
  // nears the viewport. The "Load more" button below stays as the
  // always-visible manual fallback; the observer just presses it early.
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
    // runs.length re-attaches the observer after each page lands — if a
    // short page leaves the sentinel already inside the margin, no
    // intersection TRANSITION would fire again; re-observing re-emits the
    // initial state and keeps the auto-load going.
  }, [hasNextPage, fetchNextPage, runs.length]);

  return (
    <>
      {runsQuery.isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : runsQuery.isError ? (
        <FormNote>{runsQuery.error.message}</FormNote>
      ) : runs.length === 0 ? (
        <p className="text-sm text-fg-muted">No per-run spend in this window.</p>
      ) : (
        <>
          <div className="rounded-lg border border-border">
            <div className={["hidden border-b border-border px-4 py-3 sm:grid", RUN_ROW_DESKTOP_GRID].join(" ")}>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint">Run</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint">Status</span>
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint">Started</span>
              <span className="text-right font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint">
                Tokens
              </span>
              <span className="text-right font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint">
                Calls
              </span>
              <span className="text-right font-mono text-[11px] uppercase tracking-[0.2em] text-fg-faint">
                Cost (30d)
              </span>
              {/* Chevron column carries no label — kept as an empty cell so
                  the header's seven tracks stay in lockstep with each row's. */}
              <span aria-hidden="true" />
            </div>

            <div className="divide-y divide-border">
              {runs.map((run) => (
                <AnalyticsRunRow key={run.runId} run={run} isOutlier={run.costUsd > outlierThreshold} />
              ))}
              {isFetchingNextPage
                ? [0, 1, 2].map((i) => <Skeleton key={`runs-next-${i}`} className="h-12 w-full" />)
                : null}
            </div>
          </div>

          <div ref={sentinelRef} aria-hidden="true" />

          {hasNextPage ? (
            <div className="mt-4 flex justify-center">
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
          ) : null}
        </>
      )}

      {!runsQuery.isPending && !runsQuery.isError ? (
        <p className="mt-3 text-xs text-fg-faint">
          Sums to the totals above minus planning-session spend, which isn&apos;t tied to a build. Older runs are on
          the{" "}
          <Link
            href="/builds"
            className="transition-swift text-fg-muted hover:text-ember focus-visible:text-ember focus-visible:outline-none"
          >
            Builds page
          </Link>
          .
        </p>
      ) : null}
    </>
  );
}
