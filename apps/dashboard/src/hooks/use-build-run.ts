"use client";

import { useEffect, useReducer, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buildRunSchema,
  buildTaskListSchema,
  escalationDecisionBodySchema,
  type BuildRun,
  type BuildTask,
  type EscalationDecisionBody,
} from "@mullion/schemas";
import { apiFetch, ApiError } from "../lib/api";
import { BUILD_STREAM_EVENT_TYPES, parseBuildStreamEvent } from "../lib/build-stream";
import { buildTimelineReducer, INITIAL_BUILD_TIMELINE_STATE, type BuildTimelineState } from "../lib/build-timeline-reducer";

interface UseBuildRunResult {
  run: BuildRun | undefined;
  isRunLoading: boolean;
  notFound: boolean;
  unauthorized: boolean;
  loadError: string | null;
  tasks: BuildTask[];
  isTasksLoading: boolean;
  timeline: BuildTimelineState;
  escalate: (body: EscalationDecisionBody) => void;
  isEscalating: boolean;
  escalationError: string | null;
  clearEscalationError: () => void;
}

export function useBuildRun(runId: string): UseBuildRunResult {
  const queryClient = useQueryClient();
  const [timeline, dispatch] = useReducer(buildTimelineReducer, INITIAL_BUILD_TIMELINE_STATE);
  // Fallback key for the rare case an event arrives with no SSE id at all —
  // keeps the dedupe/keying logic below total instead of throwing on it.
  const fallbackKeyRef = useRef(0);

  const runQuery = useQuery({
    queryKey: ["build", runId],
    queryFn: async () => buildRunSchema.parse(await apiFetch(`/api/builds/${runId}`)),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.status === 404 || error.status === 401)) return false;
      return failureCount < 1;
    },
  });

  const tasksQuery = useQuery({
    queryKey: ["build", runId, "tasks"],
    queryFn: async () => buildTaskListSchema.parse(await apiFetch(`/api/builds/${runId}/tasks`)),
    enabled: runQuery.isSuccess,
  });

  useEffect(() => {
    // Only open the stream once we know the run exists and is ours — avoids
    // a reconnect storm against a run that will keep 404ing/401ing.
    if (!runQuery.isSuccess) return;

    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!baseUrl) throw new Error("NEXT_PUBLIC_API_URL is not set");

    // Unlike the planning stream, there's no REST snapshot to hydrate the
    // timeline from first — lastEventId=0 IS the hydration mechanism here,
    // replaying full history per the API contract.
    const source = new EventSource(`${baseUrl}/api/builds/${runId}/stream?lastEventId=0`, {
      withCredentials: true,
    });

    const listeners = BUILD_STREAM_EVENT_TYPES.map((type) => {
      const listener = (message: MessageEvent<string>) => {
        let payload: unknown;
        try {
          payload = JSON.parse(message.data);
        } catch {
          console.error(`Malformed SSE payload for "${type}" — dropped.`);
          return;
        }
        const event = parseBuildStreamEvent(type, payload);
        if (!event) {
          console.error(`SSE event "${type}" failed schema validation — dropped.`);
          return;
        }

        const key = message.lastEventId || `${type}-${fallbackKeyRef.current++}`;
        dispatch({ type: "received", key, event });

        switch (event.kind) {
          case "phase":
            // Exact next status is already known from the payload — patch
            // it in immediately rather than waiting a round trip to refetch.
            queryClient.setQueryData(["build", runId], (current: BuildRun | undefined) =>
              current ? { ...current, status: event.status } : current,
            );
            break;
          case "task":
          case "escalation_required":
            // Only a partial row (or none at all) travels on the wire — the
            // task list's source of truth stays the REST GET, so refetch
            // rather than hand-merge a partial shape into the cache.
            queryClient.invalidateQueries({ queryKey: ["build", runId, "tasks"] });
            break;
          case "review_result":
          case "delivery_result":
            break;
          default: {
            const exhaustive: never = event;
            throw new Error(`Unhandled build stream event: ${JSON.stringify(exhaustive)}`);
          }
        }
      };
      source.addEventListener(type, listener);
      return { type, listener };
    });

    const heartbeat = () => {};
    source.addEventListener("heartbeat", heartbeat);

    return () => {
      listeners.forEach(({ type, listener }) => source.removeEventListener(type, listener));
      source.removeEventListener("heartbeat", heartbeat);
      source.close();
    };
    // The browser's own Last-Event-ID reconnect logic handles drops; this
    // effect only needs to re-run if the run being watched changes.
  }, [runId, queryClient, runQuery.isSuccess]);

  const escalateMutation = useMutation({
    mutationFn: (body: EscalationDecisionBody) =>
      apiFetch(`/api/builds/${runId}/escalate`, {
        method: "POST",
        body: JSON.stringify(escalationDecisionBodySchema.parse(body)),
      }),
    onSuccess: () => {
      dispatch({ type: "escalation_dismissed" });
      queryClient.invalidateQueries({ queryKey: ["build", runId] });
      queryClient.invalidateQueries({ queryKey: ["build", runId, "tasks"] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        // Gate expired (30-minute server-side timeout) or was already
        // resolved elsewhere — dismiss and resync rather than leaving a
        // banner the user can no longer act on.
        dispatch({ type: "escalation_dismissed" });
        queryClient.invalidateQueries({ queryKey: ["build", runId] });
      }
    },
  });

  const notFound = runQuery.error instanceof ApiError && runQuery.error.status === 404;
  const unauthorized = runQuery.error instanceof ApiError && runQuery.error.status === 401;
  const escalationIs409 = escalateMutation.error instanceof ApiError && escalateMutation.error.status === 409;

  return {
    run: runQuery.data,
    isRunLoading: runQuery.isLoading,
    notFound,
    unauthorized,
    loadError: runQuery.error && !notFound && !unauthorized ? runQuery.error.message : null,
    tasks: tasksQuery.data ?? [],
    isTasksLoading: !runQuery.isSuccess || tasksQuery.isLoading,
    timeline,
    escalate: escalateMutation.mutate,
    isEscalating: escalateMutation.isPending,
    escalationError: escalateMutation.error && !escalationIs409 ? escalateMutation.error.message : null,
    clearEscalationError: () => escalateMutation.reset(),
  };
}
