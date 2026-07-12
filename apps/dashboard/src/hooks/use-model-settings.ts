"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../lib/api";
import { modelsResponseSchema, type ModelsResponse } from "../lib/settings-api";

export const MODELS_QUERY_KEY = ["settings", "models"] as const;

export function useModelsQuery() {
  return useQuery({
    queryKey: MODELS_QUERY_KEY,
    queryFn: async () => modelsResponseSchema.parse(await apiFetch("/api/settings/models")),
  });
}

interface UpdateModelInput {
  role: string;
  /** null = revert to the platform default. */
  modelSlug: string | null;
}

function updateModelErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    // 409: the role's override survived a key removal server-side but a
    // key is required to actually select one — same copy as the disabled-
    // option tooltip so the two never say different things about why.
    if (error.status === 409) return "Add an API key to pick your own model.";
    const body = error.body as { error?: string; message?: string } | null;
    return body?.error ?? body?.message ?? "Couldn't update that role's model.";
  }
  return error instanceof Error ? error.message : "Couldn't update that role's model.";
}

// Auto-save on <select> change — no page-level Save button (spec). The
// select's own value updates optimistically so it feels instant; a failure
// rolls the cache back to the pre-mutate snapshot and the row renders the
// server's rejection reason inline.
export function useUpdateModelMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ role, modelSlug }: UpdateModelInput) => {
      try {
        return await apiFetch("/api/settings/models", {
          method: "PUT",
          body: JSON.stringify({ role, modelSlug }),
        });
      } catch (error) {
        throw new Error(updateModelErrorMessage(error));
      }
    },
    onMutate: async ({ role, modelSlug }) => {
      await queryClient.cancelQueries({ queryKey: MODELS_QUERY_KEY });
      const previous = queryClient.getQueryData<ModelsResponse>(MODELS_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<ModelsResponse>(MODELS_QUERY_KEY, {
          ...previous,
          roles: previous.roles.map((entry) =>
            entry.role === role ? { ...entry, overrideModelSlug: modelSlug } : entry,
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(MODELS_QUERY_KEY, context.previous);
      }
    },
    // Always resync with the server after settling, success or failure —
    // an optimistic write should never be the last word on this cache.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
    },
  });
}
