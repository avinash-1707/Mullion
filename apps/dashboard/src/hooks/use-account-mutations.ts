"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client";
import { apiFetch, ApiError } from "../lib/api";

// The set-password route is a custom Hono endpoint (not a better-auth
// client action), so its error body shape isn't the `{data,error}` better-
// fetch envelope the rest of this file relies on — normalize both shapes to
// a plain message here so callers only ever render `mutation.error.message`.
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const body = error.body as { message?: string; error?: string } | null;
    return body?.message ?? body?.error ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export const ACCOUNTS_QUERY_KEY = ["accounts"] as const;

// Powers both the security section's "has a password?" check (a
// `providerId: "credential"` entry) and the connected-accounts list.
export function useListAccountsQuery() {
  return useQuery({
    queryKey: ACCOUNTS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error) {
        throw new Error(error.message ?? "Couldn't load connected accounts.");
      }
      return data;
    },
  });
}

interface UpdateProfileInput {
  name: string;
  image: string;
}

export function useUpdateProfileMutation() {
  return useMutation({
    mutationFn: async ({ name, image }: UpdateProfileInput) => {
      // updateUser treats an empty string as "clear this field" for image,
      // which is exactly what an emptied avatar-URL input should do.
      const { data, error } = await authClient.updateUser({ name, image: image || null });
      if (error) {
        throw new Error(error.message ?? "Couldn't save your profile.");
      }
      return data;
    },
  });
}

// New account (no `credential` provider entry yet) — server-validated,
// session-cookie authenticated. 409s if a password already exists.
export function useSetPasswordMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newPassword: string) => {
      try {
        return await apiFetch("/api/account/set-password", {
          method: "POST",
          body: JSON.stringify({ newPassword }),
        });
      } catch (error) {
        throw new Error(errorMessage(error, "Couldn't set your password."));
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY }),
  });
}

interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

// Existing password on file — revokes other sessions on success so a leaked
// old password stops being useful anywhere else immediately.
export function useChangePasswordMutation() {
  return useMutation({
    mutationFn: async ({ currentPassword, newPassword }: ChangePasswordInput) => {
      const { data, error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) {
        throw new Error(error.message ?? "Couldn't change your password.");
      }
      return data;
    },
  });
}

export function useLinkGoogleMutation() {
  return useMutation({
    mutationFn: async (callbackURL: string) => {
      const { data, error } = await authClient.linkSocial({ provider: "google", callbackURL });
      if (error) {
        throw new Error(error.message ?? "Couldn't reach Google. Try again.");
      }
      return data;
    },
  });
}

export function useUnlinkAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (providerId: string) => {
      const { data, error } = await authClient.unlinkAccount({ providerId });
      if (error) {
        // The server also guards "don't unlink your only auth method" —
        // this message renders as-is if the client-side guard was somehow
        // bypassed (stale account list, race with another tab).
        throw new Error(error.message ?? "Couldn't disconnect that account.");
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNTS_QUERY_KEY }),
  });
}
