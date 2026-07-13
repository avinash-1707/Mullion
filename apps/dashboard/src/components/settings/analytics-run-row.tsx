import Link from "next/link";
import type { AnalyticsRun } from "@/lib/settings-api";
import { BuildStatusBadge } from "@/components/build/build-status-badge";
import { ChevronIcon } from "@/components/planning/icons";
import { formatDateTime, shortId } from "@/lib/build-format";
import { formatCompactNumber, formatUsd } from "@/lib/format";

interface AnalyticsRunRowProps {
  run: AnalyticsRun;
  /** True when this run's costUsd is > 2x the median costUsd across every
   * row currently fetched (all loaded pages). Computed once by the section
   * over the flattened list, not per-row, so every row agrees on the same
   * threshold as more pages load in. */
  isOutlier: boolean;
}

// Desktop column template — fixed tracks for every numeric/short column so
// they line up down the whole list, one flexible `1fr` track for Started
// (the only variable-length cell). Exported so the column-header row in
// analytics-section.tsx reuses this exact literal instead of a
// hand-copied duplicate that could drift out of alignment.
//   Run · Status · Started · Tokens · Calls · Cost · chevron
export const RUN_ROW_DESKTOP_GRID = "sm:grid-cols-[5rem_8.5rem_1fr_4rem_3rem_6.5rem_1.5rem] sm:items-center sm:gap-x-4 sm:gap-y-0";

// Mobile: a plain 2x2 grid (`[1fr_auto]` x 2 implicit rows). Two flex
// groups (`flex ... sm:contents`) hold row 1's id+status and row 2's
// started+tokens — `contents` drops the wrapper's own box at the desktop
// breakpoint so its children fall back into the outer grid and pick up
// their own `sm:col-start-*` placement, all from one markup tree.
export function AnalyticsRunRow({ run, isOutlier }: AnalyticsRunRowProps) {
  const totalTokens = run.promptTokens + run.completionTokens;

  return (
    <Link
      href={`/builds/${run.runId}`}
      className={[
        "transition-swift group grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1.5 px-4 py-3.5",
        RUN_ROW_DESKTOP_GRID,
        "hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none",
        // Outlier cue: ember left border on the row. Rows below threshold
        // keep a transparent 2px border so every row's text stays aligned
        // regardless of which side of the cue it's on.
        isOutlier ? "border-l-2 border-l-ember" : "border-l-2 border-l-transparent",
      ].join(" ")}
    >
      {/* Row id + status: mobile flex row (line 1, left), desktop cols 1–2 */}
      <span className="col-start-1 row-start-1 flex items-center gap-2.5 sm:contents">
        <span className="transition-swift shrink-0 font-mono text-sm text-fg group-hover:text-ember-strong sm:col-start-1 sm:row-start-1">
          {shortId(run.runId)}
        </span>
        <span className="justify-self-start sm:col-start-2 sm:row-start-1">
          <BuildStatusBadge status={run.status} />
        </span>
      </span>

      {/* Chevron: mobile line 1 right, desktop last column */}
      <ChevronIcon className="transition-swift col-start-2 row-start-1 h-4 w-4 shrink-0 justify-self-end text-fg-faint group-hover:translate-x-0.5 sm:col-start-7" />

      {/* Started + tokens: mobile flex row (line 2, left), desktop cols 3–4 */}
      <span className="col-start-1 row-start-2 flex items-center gap-3 sm:contents">
        <span className="font-mono text-xs text-fg-faint sm:col-start-3 sm:row-start-1">
          {formatDateTime(run.createdAt)}
        </span>
        <span className="font-mono text-xs text-fg-muted sm:col-start-4 sm:row-start-1 sm:text-right">
          {formatCompactNumber(totalTokens)}
        </span>
      </span>

      {/* Calls: desktop-only column 5 (spec hides it on mobile entirely) */}
      <span className="hidden font-mono text-xs text-fg-muted sm:col-start-5 sm:row-start-1 sm:block sm:text-right">
        {run.calls}
      </span>

      {/* Cost: mobile line 2 right, desktop column 6 — heaviest weight in the row */}
      <span
        className={[
          "transition-swift col-start-2 row-start-2 text-right font-mono text-sm text-fg group-hover:text-ember-strong",
          "sm:col-start-6 sm:row-start-1",
          isOutlier ? "font-semibold text-ember-strong" : "",
        ].join(" ")}
      >
        {formatUsd(run.costUsd)}
      </span>
    </Link>
  );
}
