import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Worker, type NativeConnection } from "@temporalio/worker";
import {
  makeWorkflowExporter,
  OpenTelemetryActivityInboundInterceptor,
  OpenTelemetryActivityOutboundInterceptor,
} from "@temporalio/interceptors-opentelemetry";
import type { WorkerOtelParts } from "@mullion/otel";
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

const require = createRequire(import.meta.url);

export async function createBuildWorker(args: {
  deps: ActivityDeps;
  connection?: NativeConnection | undefined;
  taskQueue?: string | undefined;
  namespace?: string | undefined;
  /**
   * When set (02 §9), spans flow across the client → workflow → activity
   * chain: activity interceptors run in Node against the global provider;
   * workflow-sandbox spans exit through the exporter sink, since the
   * isolate can't reach the NodeSDK directly.
   */
  otel?: WorkerOtelParts | undefined;
}): Promise<Worker> {
  return Worker.create({
    ...(args.connection ? { connection: args.connection } : {}),
    ...(args.namespace ? { namespace: args.namespace } : {}),
    taskQueue: args.taskQueue ?? BUILD_TASK_QUEUE,
    workflowsPath: WORKFLOWS_PATH,
    activities: createActivities(args.deps),
    ...(args.otel
      ? {
          interceptors: {
            activity: [
              (ctx) => ({
                inbound: new OpenTelemetryActivityInboundInterceptor(ctx),
                outbound: new OpenTelemetryActivityOutboundInterceptor(ctx),
              }),
            ],
            workflowModules: [
              require.resolve("@temporalio/interceptors-opentelemetry/lib/workflow-interceptors"),
            ],
          },
          sinks: {
            exporter: makeWorkflowExporter(args.otel.spanProcessor, args.otel.resource),
          },
        }
      : {}),
  });
}
