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
  failedTaskId?: string;
  failedReason?: string;
}

export type RunStatus = "queued" | "building" | "done" | "failed";

export interface RunTaskActivityArgs {
  runId: string;
  organizationId: string;
  userId: string;
  taskRowId: string;
  specTaskId: string;
  attempt: number;
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
}
