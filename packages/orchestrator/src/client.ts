import type { Client } from "@temporalio/client";
import { BUILD_TASK_QUEUE } from "./policy.js";
import { buildRunWorkflow } from "./workflows.js";
import type { BuildRunInput } from "./types.js";

/** The deterministic workflowId for a run — used to start AND to signal it. */
export function workflowIdForRun(runId: string): string {
  return `build:${runId}`;
}

/**
 * Start a build run. `workflowId` is derived from runId so a duplicate start
 * (e.g. a retried POST) is rejected by Temporal rather than launching a
 * second workflow for the same run — belt to the DB's ADR-29 slot.
 */
export async function startBuildRun(
  client: Client,
  input: BuildRunInput,
  opts?: { taskQueue?: string },
): Promise<string> {
  const handle = await client.workflow.start(buildRunWorkflow, {
    args: [input],
    taskQueue: opts?.taskQueue ?? BUILD_TASK_QUEUE,
    workflowId: workflowIdForRun(input.runId),
    workflowIdReusePolicy: "REJECT_DUPLICATE",
  });
  return handle.workflowId;
}
