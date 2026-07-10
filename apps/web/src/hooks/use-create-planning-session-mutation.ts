"use client";

import { useMutation } from "@tanstack/react-query";
import { planningSessionSchema, type PlanningSession } from "@mullion/schemas";
import { apiFetchWithStatus } from "../lib/api";

export interface CreateSessionResult {
  session: PlanningSession;
  // true when the server returned an *existing* active session instead of
  // creating a new one (200, not 201) — ADR-29, one active session per user.
  resumed: boolean;
}

export function useCreatePlanningSessionMutation() {
  return useMutation({
    mutationFn: async (idea: string): Promise<CreateSessionResult> => {
      const { status, body } = await apiFetchWithStatus("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ idea }),
      });
      return { session: planningSessionSchema.parse(body), resumed: status === 200 };
    },
  });
}
