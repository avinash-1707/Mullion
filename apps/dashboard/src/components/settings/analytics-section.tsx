"use client";

import { useAnalyticsQuery } from "@/hooks/use-analytics";
import { StatTile } from "./stat-tile";
import { RoleCostBars } from "./role-cost-bars";
import { SpendSparkline } from "./spend-sparkline";
import { FormNote } from "./form-note";
import { ChartIcon } from "@/components/planning/icons";
import { formatCompactNumber, formatUsd } from "@/lib/format";
import type { AnalyticsResponse } from "@/lib/settings-api";
import { AnalyticsTabSkeleton } from "./tab-skeletons";

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
    </div>
  );
}
