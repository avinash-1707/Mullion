"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "../lib/api";
import { byokStatusSchema, byokSaveResponseSchema } from "../lib/settings-api";
import { MODELS_QUERY_KEY } from "./use-model-settings";

export const BYOK_QUERY_KEY = ["settings", "byok"] as const;

export function useByokQuery() {
  return useQuery({
    queryKey: BYOK_QUERY_KEY,
    queryFn: async () => byokStatusSchema.parse(await apiFetch("/api/settings/byok")),
  });
}

// 400 (invalid key) and 429 (rate-limited) get distinct fallbacks since the
// server may not always send body copy for either; both still prefer the
// server's own message when it has one.
function saveKeyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: string; message?: string } | null;
    if (error.status === 429) {
      return body?.error ?? body?.message ?? "Too many attempts. Wait a moment and try again.";
    }
    return body?.error ?? body?.message ?? "That key couldn't be validated.";
  }
  return error instanceof Error ? error.message : "That key couldn't be validated.";
}

export function useSaveByokMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (apiKey: string) => {
      try {
        return byokSaveResponseSchema.parse(
          await apiFetch("/api/settings/byok", {
            method: "POST",
            body: JSON.stringify({ apiKey }),
          }),
        );
      } catch (error) {
        throw new Error(saveKeyErrorMessage(error));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BYOK_QUERY_KEY });
      // byokEnabled + each role's allowlist availability flip with the key.
      queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
    },
  });
}

function removeKeyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body as { error?: string; message?: string } | null;
    return body?.error ?? body?.message ?? "Couldn't remove your key.";
  }
  return error instanceof Error ? error.message : "Couldn't remove your key.";
}

export function useRemoveByokMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      try {
        return await apiFetch("/api/settings/byok", { method: "DELETE" });
      } catch (error) {
        throw new Error(removeKeyErrorMessage(error));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: BYOK_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
    },
  });
}
