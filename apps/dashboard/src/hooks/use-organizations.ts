"use client";

import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client";

// Org list + which one is active is AUTH state (Better Auth's organization
// plugin, backed by its own client store) — per project convention this
// stays on Better Auth's own reactive hooks, not wrapped in TanStack Query.
// Only mutations that need to invalidate TanStack-managed API data (below)
// touch the query client.

export function useOrganizationsList() {
  return authClient.useListOrganizations();
}

export function useActiveOrganizationId(): string | null {
  const { data: session } = authClient.useSession();
  return session?.session.activeOrganizationId ?? null;
}

export function useActiveOrganization() {
  const { data: organizations } = useOrganizationsList();
  const activeOrganizationId = useActiveOrganizationId();
  return useMemo(
    () => organizations?.find((org) => org.id === activeOrganizationId) ?? null,
    [organizations, activeOrganizationId],
  );
}

// Switching orgs is a round trip (setActive updates the session row
// server-side), then every piece of org-scoped data in the app is stale.
// None of today's query keys are namespaced by organizationId (BYOK,
// models, analytics, members all key without it), so an unqualified
// invalidate is the simplest correct fix rather than hand-maintaining a
// growing per-key invalidation list — namespacing every key by org id is
// the deliberate v2 refinement (would avoid the brief app-wide refetch
// flicker), not done here.
export function useSetActiveOrgMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (organizationId: string) => {
      const { data, error } = await authClient.organization.setActive({ organizationId });
      if (error) {
        throw new Error(error.message ?? "Couldn't switch organizations.");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

// Client-side twin of the API's personalOrgSlug (modules/auth/org.ts):
// slugs are unique server-side, so the random suffix keeps "Acme" creatable
// twice without surfacing slug collisions in a UI that never shows slugs.
function orgSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${base || "workspace"}-${suffix}`;
}

// Create-and-select as one mutation: a created-but-not-active workspace
// would look like a silent failure (the sidebar still shows the old org),
// so the setActive round trip is part of the same success path. Same
// unqualified invalidation rationale as useSetActiveOrgMutation above.
export function useCreateOrgMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await authClient.organization.create({ name, slug: orgSlug(name) });
      if (error || !data) {
        throw new Error(error?.message ?? "Couldn't create the workspace.");
      }
      const { error: activateError } = await authClient.organization.setActive({ organizationId: data.id });
      if (activateError) {
        throw new Error(activateError.message ?? "Workspace created, but couldn't switch to it.");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });
}

interface RenameOrgInput {
  organizationId: string;
  name: string;
}

export function useRenameOrgMutation() {
  return useMutation({
    mutationFn: async ({ organizationId, name }: RenameOrgInput) => {
      const { data, error } = await authClient.organization.update({
        organizationId,
        data: { name },
      });
      if (error) {
        throw new Error(error.message ?? "Couldn't rename this organization.");
      }
      return data;
    },
  });
}
