"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { invitationPreviewSchema } from "../lib/organizations-api";

// Deliberately unauthenticated — apiFetch always sends credentials, but
// that's harmless here (an absent/foreign cookie is simply ignored); no
// session is required to resolve this preview, which is the whole point
// (it's what decides sign-up vs sign-in for a signed-out visitor).
export function useInvitationPreviewQuery(invitationId: string) {
  return useQuery({
    queryKey: ["invitations", invitationId, "preview"],
    queryFn: async () =>
      invitationPreviewSchema.parse(await apiFetch(`/api/org/invitations/${invitationId}/preview`)),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) return false;
      return failureCount < 1;
    },
  });
}

export function useAcceptInvitationMutation() {
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { data, error } = await authClient.organization.acceptInvitation({ invitationId });
      if (error) {
        throw new Error(error.message ?? "Couldn't accept that invitation.");
      }
      return data;
    },
  });
}
