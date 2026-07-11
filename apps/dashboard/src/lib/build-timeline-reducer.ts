import type { BuildTimelineEvent } from "./build-stream";

// Pure state + reducer for the build run's event timeline and escalation
// gate — no fetch, no EventSource (those live in hooks/use-build-run.ts).
// Kept isolated so "did the right thing happen to state given this event"
// never requires a live network call to verify (CODING_STANDARDS §6),
// mirroring lib/planning-reducer.ts's split for the same reason.

export interface BuildTimelineEntry {
  key: string;
  // Client receipt time, display-only — the API contract doesn't put a
  // timestamp on every payload, only an SSE id (used for the key/reconnect
  // cursor, not the clock).
  receivedAt: number;
  event: BuildTimelineEvent;
}

export interface ActiveEscalation {
  specTaskId: string;
  reason: string;
}

export interface BuildTimelineState {
  entries: BuildTimelineEntry[];
  activeEscalation: ActiveEscalation | null;
}

export const INITIAL_BUILD_TIMELINE_STATE: BuildTimelineState = {
  entries: [],
  activeEscalation: null,
};

export type BuildTimelineAction =
  | { type: "received"; key: string; event: BuildTimelineEvent }
  | { type: "escalation_dismissed" };

function isTerminalRunStatus(status: string): boolean {
  return status === "done" || status === "failed";
}

export function buildTimelineReducer(state: BuildTimelineState, action: BuildTimelineAction): BuildTimelineState {
  switch (action.type) {
    case "received": {
      // De-dupe by key: a reconnect replays from Last-Event-ID and would
      // otherwise double-append an event already rendered.
      if (state.entries.some((entry) => entry.key === action.key)) return state;

      const entry: BuildTimelineEntry = { key: action.key, receivedAt: Date.now(), event: action.event };
      let activeEscalation = state.activeEscalation;

      switch (action.event.kind) {
        case "escalation_required":
          activeEscalation = { specTaskId: action.event.specTaskId, reason: action.event.reason };
          break;
        case "phase":
          // A terminal run can't still have a live gate — safety net beyond
          // the mutation-driven dismissal (escalation_dismissed).
          if (isTerminalRunStatus(action.event.status)) activeEscalation = null;
          break;
        case "task":
        case "review_result":
        case "delivery_result":
          break;
        default: {
          const exhaustive: never = action.event;
          throw new Error(`Unhandled timeline event: ${JSON.stringify(exhaustive)}`);
        }
      }

      return { entries: [...state.entries, entry], activeEscalation };
    }

    case "escalation_dismissed":
      return { ...state, activeEscalation: null };

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled timeline action: ${JSON.stringify(exhaustive)}`);
    }
  }
}
