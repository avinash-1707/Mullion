import type { Resource } from "@opentelemetry/resources";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-base";

export interface WorkerOtelParts {
  spanProcessor: SpanProcessor;
  resource: Resource;
}

/**
 * Span-processor + resource for Temporal's workflow-sandbox exporter sink
 * (makeWorkflowExporter). Workflow code runs in an isolated V8 context that
 * can't reach the NodeSDK provider — its spans exit through a sink fed by
 * this separate processor, exporting to the same OTLP endpoint. Same
 * enable-gate as startOtel; heavy imports stay dynamic.
 */
export async function createWorkerOtelParts(args: {
  serviceName: string;
}): Promise<WorkerOtelParts | undefined> {
  if (!process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] || process.env["OTEL_SDK_DISABLED"] === "true") {
    return undefined;
  }
  const [{ BatchSpanProcessor }, { OTLPTraceExporter }, { Resource }, { ATTR_SERVICE_NAME }] =
    await Promise.all([
      import("@opentelemetry/sdk-trace-base"),
      import("@opentelemetry/exporter-trace-otlp-http"),
      import("@opentelemetry/resources"),
      import("@opentelemetry/semantic-conventions"),
    ]);
  return {
    spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter()),
    resource: new Resource({ [ATTR_SERVICE_NAME]: args.serviceName }),
  };
}
