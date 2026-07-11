import type {
  ConsistencyResult,
  DecisionEntry,
  GraphEdge,
  GraphNode,
  McqAnswer,
  McqQuestion,
  McqRound,
  PlanningEvent,
  PlanningSnapshot,
  RequirementsDocVersion,
} from "@mullion/schemas";

// Pure state + reducer for the Phase 2 planning session — no fetch, no
// EventSource, no side effects (those live in use-planning-session.ts).
// Kept isolated so "did the right thing happen to state given this event"
// never requires a live network call to verify (CODING_STANDARDS §6).

// A planner "pushback" on a contradictory/infeasible edit prompt (01 §4.2).
// Not part of PlanningSnapshot — it's ephemeral log content the stream emits,
// not persisted state a page reload needs to reconstruct — so it lives only
// in client state, keyed by the (uuid) question id for idempotent upserts
// and answered-once bookkeeping.
export interface ClarificationLogEntry {
  id: string;
  statement: string;
  question: McqQuestion;
  createdAt: string;
  answered: boolean;
}

export interface PlanningState {
  session: PlanningSnapshot["session"] & {
    // Which agent the current working/error status belongs to — carried on
    // every agent_status event but not part of the persisted snapshot shape.
    agentActor: string | null;
  };
  rounds: McqRound[];
  requirements: RequirementsDocVersion | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  decisions: DecisionEntry[];
  clarifications: ClarificationLogEntry[];
  consistency: ConsistencyResult | null;
  buildSpec: PlanningSnapshot["buildSpec"];
}

export type PlanningAction =
  | { type: "hydrate"; snapshot: PlanningSnapshot }
  | { type: "event"; event: PlanningEvent }
  | { type: "clarification_answered"; questionId: string }
  | { type: "answers_submitted_optimistic"; roundId: string; answers: McqAnswer[] };

function upsertBy<T>(list: T[], item: T, matches: (existing: T) => boolean): T[] {
  const index = list.findIndex(matches);
  if (index === -1) return [...list, item];
  const next = list.slice();
  next[index] = item;
  return next;
}

function hydrate(snapshot: PlanningSnapshot): PlanningState {
  return {
    session: { ...snapshot.session, agentActor: null },
    rounds: snapshot.rounds,
    requirements: snapshot.requirements,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    decisions: snapshot.decisions,
    clarifications: [],
    consistency: snapshot.consistency,
    buildSpec: snapshot.buildSpec,
  };
}

function applyEvent(state: PlanningState, event: PlanningEvent): PlanningState {
  switch (event.type) {
    case "phase":
      return { ...state, session: { ...state.session, phase: event.phase, status: event.status } };

    case "agent_status":
      return {
        ...state,
        session: {
          ...state.session,
          agentState: event.state,
          agentError: event.state === "error" ? (event.message ?? "The agent hit an unexpected error.") : null,
          agentActor: event.actor,
        },
      };

    case "question_round":
      return { ...state, rounds: upsertBy(state.rounds, event.round, (r) => r.round === event.round.round) };

    // Ack-only: the real content was already applied optimistically when the
    // answers mutation resolved. Handled explicitly (not folded into a
    // default) so a future payload change here is a compile-time prompt.
    case "answers_recorded":
      return state;

    case "requirements":
      if (state.requirements && state.requirements.version >= event.doc.version) return state;
      return { ...state, requirements: event.doc };

    case "node":
      return { ...state, nodes: upsertBy(state.nodes, event.node, (n) => n.nodeKey === event.node.nodeKey) };

    case "edge":
      return {
        ...state,
        edges: upsertBy(
          state.edges,
          event.edge,
          (e) => e.sourceKey === event.edge.sourceKey && e.targetKey === event.edge.targetKey,
        ),
      };

    case "decision":
      if (state.decisions.some((d) => d.id === event.entry.id)) return state;
      return { ...state, decisions: [...state.decisions, event.entry] };

    case "clarification":
      if (state.clarifications.some((c) => c.id === event.question.id)) return state;
      return {
        ...state,
        clarifications: [
          ...state.clarifications,
          {
            id: event.question.id,
            statement: event.statement,
            question: event.question,
            createdAt: new Date().toISOString(),
            answered: false,
          },
        ],
      };

    case "consistency":
      return { ...state, consistency: event.result };

    case "frozen":
      return {
        ...state,
        session: { ...state.session, status: "confirmed" },
        buildSpec: { id: event.buildSpecId, contentHash: event.contentHash, frozenAt: new Date().toISOString() },
      };

    default: {
      const exhaustive: never = event;
      throw new Error(`Unhandled planning event: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function planningReducer(state: PlanningState | null, action: PlanningAction): PlanningState | null {
  switch (action.type) {
    case "hydrate":
      return hydrate(action.snapshot);

    case "event":
      return state ? applyEvent(state, action.event) : state;

    case "clarification_answered":
      if (!state) return state;
      return {
        ...state,
        clarifications: state.clarifications.map((c) =>
          c.id === action.questionId ? { ...c, answered: true } : c,
        ),
      };

    case "answers_submitted_optimistic":
      if (!state) return state;
      return {
        ...state,
        rounds: state.rounds.map((r) => (r.id === action.roundId ? { ...r, answers: action.answers } : r)),
      };

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled planning action: ${JSON.stringify(exhaustive)}`);
    }
  }
}
