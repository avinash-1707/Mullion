"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { analyticsResponseSchema } from "../lib/settings-api";

const ANALYTICS_WINDOW_DAYS = 30;

export function useAnalyticsQuery() {
  return useQuery({
    queryKey: ["settings", "analytics", ANALYTICS_WINDOW_DAYS] as const,
    queryFn: async () =>
      analyticsResponseSchema.parse(await apiFetch(`/api/settings/analytics?days=${ANALYTICS_WINDOW_DAYS}`)),
  });
}
