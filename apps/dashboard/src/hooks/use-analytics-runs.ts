"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { analyticsRunsPageSchema } from "../lib/settings-api";

// Same fixed window as useAnalyticsQuery — the list must agree with the
// tiles above it on what "the window" is (both label it in the UI).
const ANALYTICS_WINDOW_DAYS = 30;

export function useAnalyticsRunsQuery() {
  return useInfiniteQuery({
    queryKey: ["settings", "analytics", "runs", ANALYTICS_WINDOW_DAYS] as const,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ days: String(ANALYTICS_WINDOW_DAYS) });
      if (pageParam) params.set("cursor", pageParam);
      return analyticsRunsPageSchema.parse(await apiFetch(`/api/settings/analytics/runs?${params.toString()}`));
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
