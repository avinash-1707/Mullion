"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../lib/api";
import { authClient } from "../lib/auth-client";
import { orgMembersResponseSchema, type OrgMembersResponse, type OrgRole } from "../lib/organizations-api";

export const ORG_MEMBERS_QUERY_KEY = ["organizations", "members"] as const;

export function useOrgMembersQuery() {
  return useQuery({
    queryKey: ORG_MEMBERS_QUERY_KEY,
    queryFn: async () => orgMembersResponseSchema.parse(await apiFetch("/api/org/members")),
  });
}

function orgApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { message?: string; error?: string } | null;
    return body?.message ?? body?.error ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

interface UpdateMemberRoleInput {
  memberId: string;
  role: OrgRole;
}

// Optimistic + rollback, copying useUpdateModelMutation's shape exactly
// (hooks/use-model-settings.ts) — same reversible, low-friction commit
// pattern extended to org roles. The 409 last-admin guard rolls back and
// renders through the same onError path as any other rejection.
export function useUpdateMemberRoleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, role }: UpdateMemberRoleInput) => {
      try {
        return await apiFetch(`/api/org/members/${memberId}`, {
          method: "PATCH",
          body: JSON.stringify({ role }),
        });
      } catch (error) {
        throw new Error(orgApiErrorMessage(error, "Couldn't update that member's role."));
      }
    },
    onMutate: async ({ memberId, role }) => {
      await queryClient.cancelQueries({ queryKey: ORG_MEMBERS_QUERY_KEY });
      const previous = queryClient.getQueryData<OrgMembersResponse>(ORG_MEMBERS_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<OrgMembersResponse>(ORG_MEMBERS_QUERY_KEY, {
          ...previous,
          members: previous.members.map((member) => (member.id === memberId ? { ...member, role } : member)),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ORG_MEMBERS_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ORG_MEMBERS_QUERY_KEY });
    },
  });
}

// Not optimistic (unlike role change) — removal is irreversible-ish (needs
// a re-invite) and already gets a ConfirmDialog pause, so a plain
// pending-then-invalidate is more honest than an optimistic remove-then-
// restore-on-error would be.
export function useRemoveMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      try {
        return await apiFetch(`/api/org/members/${memberId}`, { method: "DELETE" });
      } catch (error) {
        throw new Error(orgApiErrorMessage(error, "Couldn't remove that member."));
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ORG_MEMBERS_QUERY_KEY }),
  });
}

// POST /api/org/leave: 409 (last admin) and 400 (personal/only org) both
// come back as plain thrown Errors — the caller (MembersSection) renders
// whichever message the server sent via FormNote, same convention as every
// other mutation error in this feature.
export function useLeaveOrgMutation() {
  return useMutation({
    mutationFn: async () => {
      try {
        return await apiFetch("/api/org/leave", { method: "POST" });
      } catch (error) {
        throw new Error(orgApiErrorMessage(error, "Couldn't leave this organization."));
      }
    },
  });
}

interface InviteMemberInput {
  email: string;
  role: OrgRole;
}

// authClient.organization.inviteMember (stock Better Auth org-plugin
// action) — re-inviting the same email is the server's own resend
// mechanism (cancels the old pending row, issues a new one), so this one
// mutation backs both the invite form and pending-invite-row's Resend
// button; each caller owns its own hook instance (same "each row owns its
// own mutation" convention as ModelRoleRow).
export function useInviteMemberMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: InviteMemberInput) => {
      const { data, error } = await authClient.organization.inviteMember({ email, role });
      if (error) {
        throw new Error(error.message ?? "Couldn't send that invitation.");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ORG_MEMBERS_QUERY_KEY }),
  });
}

export function useRevokeInvitationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { data, error } = await authClient.organization.cancelInvitation({ invitationId });
      if (error) {
        throw new Error(error.message ?? "Couldn't revoke that invitation.");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ORG_MEMBERS_QUERY_KEY }),
  });
}
