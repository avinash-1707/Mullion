"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  confirmConflictBodySchema,
  confirmSessionResponseSchema,
  planningEventSchema,
  planningSnapshotSchema,
  type ConsistencyIssue,
  type McqAnswer,
} from "@mullion/schemas";
import { apiFetch, ApiError } from "../lib/api";
import { planningReducer, type PlanningState } from "../lib/planning-reducer";

const confirmSuccessSchema = confirmSessionResponseSchema;
const confirmConflictSchema = confirmConflictBodySchema;

export interface ConfirmConflict {
  message: string;
  issues: ConsistencyIssue[] | undefined;
}

const SSE_EVENT_TYPES = [
  "phase",
  "agent_status",
  "question_round",
  "answers_recorded",
  "requirements",
  "node",
  "edge",
  "decision",
  "clarification",
  "consistency",
  "frozen",
] as const;

interface UsePlanningSessionResult {
  state: PlanningState | null;
  isLoading: boolean;
  notFound: boolean;
  unauthorized: boolean;
  loadError: string | null;
  submitAnswers: (input: { roundId: string; answers: McqAnswer[] }) => void;
  isSubmittingAnswers: boolean;
  proceed: () => void;
  isProceeding: boolean;
  submitEdit: (prompt: string) => void;
  isSubmittingEdit: boolean;
  retry: () => void;
  isRetrying: boolean;
  confirm: () => void;
  isConfirming: boolean;
  confirmConflict: ConfirmConflict | null;
  clearConfirmConflict: () => void;
  markClarificationAnswered: (questionId: string) => void;
}

export function usePlanningSession(sessionId: string): UsePlanningSessionResult {
  const [state, dispatch] = useReducer(planningReducer, null);
  const lastEventIdRef = useRef(0);
  // Derived, not stored: state carries the session it was hydrated from, so
  // a dynamic-segment navigation naturally reads as "not hydrated" until the
  // new session's snapshot lands — no reset effect needed.
  const hydrated = state?.session.id === sessionId;

  const snapshotQuery = useQuery({
    queryKey: ["planning-session", sessionId],
    queryFn: async () => {
      const body = await apiFetch(`/api/sessions/${sessionId}/snapshot`);
      return planningSnapshotSchema.parse(body);
    },
    // SSE is authoritative once connected (see the effect below) — refetching
    // this on window focus would just replay a slightly-stale copy of state
    // the reducer already has, for no benefit.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.status === 404 || error.status === 401)) return false;
      return failureCount < 1;
    },
  });

  useEffect(() => {
    const snapshot = snapshotQuery.data;
    if (snapshot && snapshot.session.id === sessionId && !hydrated) {
      lastEventIdRef.current = snapshot.lastEventId;
      dispatch({ type: "hydrate", snapshot });
    }
  }, [snapshotQuery.data, sessionId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!baseUrl) throw new Error("NEXT_PUBLIC_API_URL is not set");

    const source = new EventSource(
      `${baseUrl}/api/sessions/${sessionId}/stream?lastEventId=${lastEventIdRef.current}`,
      { withCredentials: true },
    );

    const listeners = SSE_EVENT_TYPES.map((type) => {
      const listener = (message: MessageEvent<string>) => {
        let payload: unknown;
        try {
          payload = JSON.parse(message.data);
        } catch {
          console.error(`Malformed SSE payload for "${type}" - dropped.`);
          return;
        }
        const parsed = planningEventSchema.safeParse(payload);
        if (!parsed.success) {
          console.error(`SSE event "${type}" failed schema validation`, parsed.error);
          return;
        }
        dispatch({ type: "event", event: parsed.data });
      };
      source.addEventListener(type, listener);
      return { type, listener };
    });

    // Heartbeats keep the connection alive through proxies; nothing to do.
    const heartbeat = () => {};
    source.addEventListener("heartbeat", heartbeat);

    return () => {
      listeners.forEach(({ type, listener }) => source.removeEventListener(type, listener));
      source.removeEventListener("heartbeat", heartbeat);
      source.close();
    };
    // The browser's own Last-Event-ID reconnect logic handles drops; this
    // effect intentionally only re-runs on session/hydration change, not on
    // every snapshot refetch (see staleTime above).
  }, [hydrated, sessionId]);

  const submitAnswersMutation = useMutation({
    mutationFn: async (input: { roundId: string; answers: McqAnswer[] }) => {
      await apiFetch(`/api/sessions/${sessionId}/answers`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      return input;
    },
    onSuccess: (input) => {
      dispatch({ type: "answers_submitted_optimistic", roundId: input.roundId, answers: input.answers });
    },
  });

  const proceedMutation = useMutation({
    mutationFn: () => apiFetch(`/api/sessions/${sessionId}/proceed`, { method: "POST" }),
    onSuccess: () => {
      dispatch({ type: "event", event: { type: "phase", phase: "architecture", status: "active" } });
    },
  });

  const editMutation = useMutation({
    mutationFn: (prompt: string) =>
      apiFetch(`/api/sessions/${sessionId}/edit`, { method: "POST", body: JSON.stringify({ prompt }) }),
    onSuccess: () => {
      // Optimistic nudge so the "agent is working" state appears immediately
      // rather than waiting a full round trip for the real agent_status event.
      dispatch({
        type: "event",
        event: { type: "agent_status", state: "working", actor: state?.session.agentActor ?? "planner" },
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: () => apiFetch(`/api/sessions/${sessionId}/retry`, { method: "POST" }),
    onSuccess: () => {
      dispatch({
        type: "event",
        event: { type: "agent_status", state: "working", actor: state?.session.agentActor ?? "planner" },
      });
    },
  });

  const [confirmConflict, setConfirmConflict] = useState<ConfirmConflict | null>(null);

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const body = await apiFetch(`/api/sessions/${sessionId}/confirm`, { method: "POST" });
      return confirmSuccessSchema.parse(body);
    },
    onMutate: () => setConfirmConflict(null),
    onSuccess: (data) => {
      dispatch({
        type: "event",
        event: { type: "frozen", buildSpecId: data.buildSpecId, contentHash: data.contentHash },
      });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        const parsed = confirmConflictSchema.safeParse(error.body);
        setConfirmConflict({
          message: parsed.success ? parsed.data.error : "Confirmation was rejected - try again after re-checking the graph.",
          issues: parsed.success ? parsed.data.issues : undefined,
        });
        return;
      }
      setConfirmConflict({ message: "Something went wrong confirming the architecture. Try again.", issues: undefined });
    },
  });

  const markClarificationAnswered = useCallback((questionId: string) => {
    dispatch({ type: "clarification_answered", questionId });
  }, []);

  const notFound = snapshotQuery.error instanceof ApiError && snapshotQuery.error.status === 404;
  const unauthorized = snapshotQuery.error instanceof ApiError && snapshotQuery.error.status === 401;

  return {
    state,
    isLoading: snapshotQuery.isLoading || (!state && !snapshotQuery.isError),
    notFound,
    unauthorized,
    loadError: snapshotQuery.error && !notFound && !unauthorized ? snapshotQuery.error.message : null,
    submitAnswers: submitAnswersMutation.mutate,
    isSubmittingAnswers: submitAnswersMutation.isPending,
    proceed: () => proceedMutation.mutate(),
    isProceeding: proceedMutation.isPending,
    submitEdit: editMutation.mutate,
    isSubmittingEdit: editMutation.isPending,
    retry: () => retryMutation.mutate(),
    isRetrying: retryMutation.isPending,
    confirm: () => confirmMutation.mutate(),
    isConfirming: confirmMutation.isPending,
    confirmConflict,
    clearConfirmConflict: () => setConfirmConflict(null),
    markClarificationAnswered,
  };
}
