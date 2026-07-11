import { fileURLToPath } from "node:url";
import { Worker, type NativeConnection } from "@temporalio/worker";
import { createActivities, type ActivityDeps } from "./activities.js";
import { BUILD_TASK_QUEUE } from "./policy.js";

/**
 * Build worker factory (ADR-50). Runs in a separate process from the API but
 * the same deployable (02 §7.1). The workflow bundle is resolved from
 * ./workflows; activities are built from injected deps so the same wiring
 * serves prod and tests.
 *
 * The packages here are consumed as TS source (exports point at ./src/*.ts),
 * so the workflow path resolves to the .ts file; Temporal's worker bundler
 * transpiles it in isolation.
 */
export const WORKFLOWS_PATH = fileURLToPath(new URL("./workflows.ts", import.meta.url));

export async function createBuildWorker(args: {
  deps: ActivityDeps;
  connection?: NativeConnection | undefined;
  taskQueue?: string | undefined;
  namespace?: string | undefined;
}): Promise<Worker> {
  return Worker.create({
    ...(args.connection ? { connection: args.connection } : {}),
    ...(args.namespace ? { namespace: args.namespace } : {}),
    taskQueue: args.taskQueue ?? BUILD_TASK_QUEUE,
    workflowsPath: WORKFLOWS_PATH,
    activities: createActivities(args.deps),
  });
}
