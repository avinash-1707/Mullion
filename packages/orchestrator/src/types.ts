import type { TaskResult } from "@mullion/schemas";
import type { TaskGraphNode } from "./policy.js";

/**
 * Shared type surface between the workflow (isolate-safe) and the activity
 * implementations (heavy Node deps). Types only — no runtime imports — so
 * workflows.ts can reference activity signatures without pulling
 * @mullion/{agents,db,sandbox} into the isolate.
 */

export interface BuildRunInput {
  runId: string;
  buildSpecId: string;
  organizationId: string;
  userId: string;
}

export interface BuildRunResult {
  status: "done" | "failed";
  tasksVerified: number;
  tasksTotal: number;
  reviewApproved?: boolean;
  deliveries?: { kind: string; ref: string }[];
  failedTaskId?: string;
  failedReason?: string;
}

export type RunStatus = "queued" | "building" | "reviewing" | "shipping" | "done" | "failed";

export interface RunTaskActivityArgs {
  runId: string;
  organizationId: string;
  userId: string;
  taskRowId: string;
  specTaskId: string;
  attempt: number;
  /** ADR-55: the ONE sanctioned free-text-during-build input — an escalation redirect. */
  redirectInstruction?: string | undefined;
}

export interface ReviewActivityResult {
  approved: boolean;
  blockerCount: number;
}

export interface ShipActivityResult {
  deliveries: { kind: string; ref: string }[];
}

/** The activity interface proxied by the workflow (ADR-50). */
export interface BuildActivities {
  loadTaskGraphActivity(args: {
    buildSpecId: string;
    organizationId: string;
  }): Promise<TaskGraphNode[]>;

  ensureTaskRowActivity(args: {
    runId: string;
    organizationId: string;
    node: TaskGraphNode;
    verifyCommand: string;
  }): Promise<{ taskRowId: string }>;

  setRunStatusActivity(args: {
    runId: string;
    organizationId: string;
    status: RunStatus;
  }): Promise<void>;

  runTaskActivity(args: RunTaskActivityArgs): Promise<TaskResult>;

  publishEscalationActivity(args: {
    runId: string;
    organizationId: string;
    specTaskId: string;
    reason: string;
  }): Promise<void>;

  /** M4: read the produced tree + decision log, run the Reviewer, record the verdict. */
  reviewActivity(args: {
    runId: string;
    organizationId: string;
    buildSpecId: string;
  }): Promise<ReviewActivityResult>;

  /** M4: package + deliver the produced tree (archive + GitHub if linked), ADR-33. */
  shipActivity(args: {
    runId: string;
    organizationId: string;
    userId: string;
    isPartial: boolean;
    summary: string;
  }): Promise<ShipActivityResult>;
}
