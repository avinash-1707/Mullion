"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { planningSessionSchema, type PlanningSession } from "@mullion/schemas";
import { apiFetchWithStatus } from "../lib/api";

export interface CreateSessionResult {
  session: PlanningSession;
  // true when the server returned an *existing* active session instead of
  // creating a new one (200, not 201) — ADR-29, one active session per user.
  resumed: boolean;
}

export function useCreatePlanningSessionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (idea: string): Promise<CreateSessionResult> => {
      const { status, body } = await apiFetchWithStatus("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ idea }),
      });
      return { session: planningSessionSchema.parse(body), resumed: status === 200 };
    },
    onSuccess: () => {
      // A new build row exists now (ADR-83) — the prefix hits both the
      // builds page (["builds","list"]) and the dashboard recents
      // (["builds","recent"]), which are otherwise fresh for 60s.
      void queryClient.invalidateQueries({ queryKey: ["builds"] });
    },
  });
}
