import { z } from "zod";

// Product Phase 1–3 contracts (01 §3–5, 02 §2). Shared by the Hono handlers,
// the agent parsers, and the Next.js client — never duplicated per side
// (CODING_STANDARDS §8).

// ---------------------------------------------------------------------------
// MCQ clarification (Analyst, 01 §3 / 02 §2.2)
// ---------------------------------------------------------------------------

export const mcqQuestionSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1),
  type: z.enum(["single_select", "multi_select"]),
  // 2–4 concrete options; the UI always appends an "Other (type your own)"
  // escape hatch (01 §0 assumption) — it is not part of this list.
  options: z.array(z.string().min(1)).min(2).max(4),
  // Requirement dimensions this answer influences — lets the UI re-trigger
  // only affected follow-ups when an earlier answer is edited (02 §2.2).
  affects: z.array(z.string()).default([]),
});

export type McqQuestion = z.infer<typeof mcqQuestionSchema>;

export const mcqAnswerSchema = z
  .object({
    questionId: z.string().uuid(),
    // Chosen from the question's options verbatim. Empty is allowed only
    // when otherText carries the real answer.
    selectedOptions: z.array(z.string()).default([]),
    otherText: z.string().max(2_000).optional(),
  })
  .refine((a) => a.selectedOptions.length > 0 || (a.otherText ?? "").trim().length > 0, {
    message: "Answer must select an option or provide otherText",
  });

export type McqAnswer = z.infer<typeof mcqAnswerSchema>;

export const mcqRoundSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  round: z.number().int().min(1).max(2),
  questions: z.array(mcqQuestionSchema),
  answers: z.array(mcqAnswerSchema).nullable(),
  createdAt: z.string(),
});

export type McqRound = z.infer<typeof mcqRoundSchema>;

// ---------------------------------------------------------------------------
// Requirements Document (01 §3 output)
// ---------------------------------------------------------------------------

export const requirementsDocSchema = z.object({
  summary: z.string().min(1).max(2_000),
  functionalRequirements: z.array(z.string().min(1).max(600)).min(1).max(60),
  nonFunctionalConstraints: z.array(z.string().max(600)).max(60),
  // Everything still unresolved after the 2-round cap, in plain language,
  // flagged editable in the UI (01 §3.3).
  assumptions: z.array(z.string().max(600)).max(60),
  scope: z.object({
    inV1: z.array(z.string().min(1).max(600)).min(1).max(60),
    outOfV1: z.array(z.string().max(600)).max(60),
  }),
});

export type RequirementsDoc = z.infer<typeof requirementsDocSchema>;

export const requirementsDocVersionSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  version: z.number().int().min(1),
  doc: requirementsDocSchema,
  createdAt: z.string(),
});

export type RequirementsDocVersion = z.infer<typeof requirementsDocVersionSchema>;

// ---------------------------------------------------------------------------
// Architecture graph (Planner/Architect, 01 §4.1 / 02 §2.3)
// ---------------------------------------------------------------------------

export const graphNodeKindSchema = z.enum(["service", "datastore", "external", "task"]);
export type GraphNodeKind = z.infer<typeof graphNodeKindSchema>;

// 'removed' nodes stay visible but ghosted — never silently deleted (02 §12).
export const graphNodeStatusSchema = z.enum(["active", "removed"]);
export type GraphNodeStatus = z.infer<typeof graphNodeStatusSchema>;

export const graphNodeSchema = z.object({
  id: z.string().uuid(),
  // Stable planner-chosen slug (e.g. "api-service") — edges and task
  // dependencies reference keys, not row ids, so re-derivation can replace
  // a node's content without rewiring everything (02 §2.3).
  nodeKey: z.string().min(1),
  kind: graphNodeKindSchema,
  label: z.string().min(1),
  description: z.string(),
  status: graphNodeStatusSchema,
  // revision > 1 renders the "revised" flag (01 §4.1).
  revision: z.number().int().min(1),
  // Task nodes carry the task-graph fields consumed unchanged by Fork B
  // (02 §2.5); other kinds leave them unset.
  acceptanceCriteria: z.string().optional(),
  dependsOn: z.array(z.string()).default([]),
  decisionId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeSchema = z.object({
  id: z.string().uuid(),
  sourceKey: z.string().min(1),
  targetKey: z.string().min(1),
  label: z.string().optional(),
  status: graphNodeStatusSchema,
});

export type GraphEdge = z.infer<typeof graphEdgeSchema>;

// ---------------------------------------------------------------------------
// Decision log entries (02 §4.1) — API shape of a decision_log row
// ---------------------------------------------------------------------------

export const decisionEntrySchema = z.object({
  id: z.string().uuid(),
  phase: z.enum(["requirements", "architecture", "build"]),
  actor: z.string(),
  decision: z.string(),
  rationale: z.string().nullable(),
  alternativesConsidered: z.string().nullable(),
  supersedes: z.string().uuid().nullable(),
  createdAt: z.string(),
});

export type DecisionEntry = z.infer<typeof decisionEntrySchema>;

// ---------------------------------------------------------------------------
// Consistency check (01 §4.3 / 02 §2.3)
// ---------------------------------------------------------------------------

export const consistencyIssueSchema = z.object({
  code: z.enum([
    "dangling_edge",
    "missing_task_dependency",
    "reference_to_removed_node",
    "orphan_node",
    "dependency_cycle",
    "requirement_contradiction",
    "uncovered_requirement",
  ]),
  message: z.string(),
  nodeKeys: z.array(z.string()).default([]),
});

export type ConsistencyIssue = z.infer<typeof consistencyIssueSchema>;

export const consistencyResultSchema = z.object({
  status: z.enum(["pass", "fail"]),
  issues: z.array(consistencyIssueSchema),
  // Which graph revision this verdict covers — a stale pass never enables
  // the confirm button (01 §4.3).
  graphVersion: z.number().int(),
});

export type ConsistencyResult = z.infer<typeof consistencyResultSchema>;

// ---------------------------------------------------------------------------
// Session state machine additions (product phases within an active session)
// ---------------------------------------------------------------------------

export const planningPhaseSchema = z.enum(["requirements", "architecture"]);
export type PlanningPhase = z.infer<typeof planningPhaseSchema>;

// What the background agent loop is doing right now — drives the inline
// error + "try again" affordance (02 §2.4) and disables conflicting input.
export const agentStateSchema = z.enum(["idle", "working", "error"]);
export type AgentState = z.infer<typeof agentStateSchema>;

// The resumable unit of agent work; persisted so a manual retry re-runs
// exactly what failed (ADR-30 — no retry budget, a human is present).
export const agentTaskSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("question_round"), round: z.number().int().min(1).max(2) }),
  z.object({ kind: z.literal("requirements_doc") }),
  z.object({ kind: z.literal("plan_architecture") }),
  z.object({ kind: z.literal("edit_prompt"), prompt: z.string() }),
  z.object({ kind: z.literal("consistency_check") }),
]);

export type AgentTask = z.infer<typeof agentTaskSchema>;

// ---------------------------------------------------------------------------
// SSE event payloads (ADR-18) — one discriminated union, `type` mirrors the
// SSE `event:` field so either can drive parsing.
// ---------------------------------------------------------------------------

export const planningEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("phase"),
    phase: planningPhaseSchema,
    status: z.enum(["active", "confirmed", "abandoned"]),
  }),
  z.object({
    type: z.literal("agent_status"),
    state: agentStateSchema,
    actor: z.string(),
    // Present when state === 'error': the inline message + retryability.
    message: z.string().optional(),
  }),
  z.object({ type: z.literal("question_round"), round: mcqRoundSchema }),
  z.object({ type: z.literal("answers_recorded"), roundId: z.string().uuid() }),
  z.object({ type: z.literal("requirements"), doc: requirementsDocVersionSchema }),
  z.object({ type: z.literal("node"), node: graphNodeSchema }),
  z.object({ type: z.literal("edge"), edge: graphEdgeSchema }),
  z.object({ type: z.literal("decision"), entry: decisionEntrySchema }),
  // Planner pushback on a contradictory/infeasible edit prompt (01 §4.2):
  // a plain statement plus one clarifying MCQ, answered via a follow-up
  // edit prompt — never a silently picked interpretation.
  z.object({
    type: z.literal("clarification"),
    statement: z.string(),
    question: mcqQuestionSchema,
  }),
  z.object({ type: z.literal("consistency"), result: consistencyResultSchema }),
  z.object({
    type: z.literal("frozen"),
    buildSpecId: z.string().uuid(),
    contentHash: z.string(),
  }),
]);

export type PlanningEvent = z.infer<typeof planningEventSchema>;

// ---------------------------------------------------------------------------
// Route bodies + snapshot (one schema per route, CODING_STANDARDS §8)
// ---------------------------------------------------------------------------

export const submitAnswersBodySchema = z.object({
  roundId: z.string().uuid(),
  answers: z.array(mcqAnswerSchema).min(1),
});

export const editPromptBodySchema = z.object({
  prompt: z.string().min(1).max(4_000),
});

export const confirmSessionResponseSchema = z.object({
  buildSpecId: z.string().uuid(),
  contentHash: z.string(),
});

export type ConfirmSessionResponse = z.infer<typeof confirmSessionResponseSchema>;

// 409 body when confirmation is blocked by unresolved consistency issues.
export const confirmConflictBodySchema = z.object({
  error: z.string(),
  issues: z.array(consistencyIssueSchema).optional(),
});

export type ConfirmConflictBody = z.infer<typeof confirmConflictBodySchema>;

export const planningSnapshotSchema = z.object({
  session: z.object({
    id: z.string().uuid(),
    organizationId: z.string(),
    userId: z.string(),
    // Creator identity for the decision log's "user" rows — resolved
    // server-side so org members viewing someone else's session see the
    // creator, not themselves. Name falls back to "" if the user row is gone.
    userName: z.string(),
    userImage: z.string().nullable(),
    status: z.enum(["active", "confirmed", "abandoned"]),
    phase: planningPhaseSchema,
    agentState: agentStateSchema,
    agentError: z.string().nullable(),
    idea: z.string(),
    graphVersion: z.number().int(),
    createdAt: z.string(),
  }),
  rounds: z.array(mcqRoundSchema),
  requirements: requirementsDocVersionSchema.nullable(),
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  decisions: z.array(decisionEntrySchema),
  consistency: consistencyResultSchema.nullable(),
  buildSpec: z
    .object({ id: z.string().uuid(), contentHash: z.string(), frozenAt: z.string() })
    .nullable(),
  // Resume the live tail from here — everything above is already reflected.
  lastEventId: z.number().int(),
});

export type PlanningSnapshot = z.infer<typeof planningSnapshotSchema>;
