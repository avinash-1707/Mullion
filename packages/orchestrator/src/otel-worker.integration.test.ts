import { describe, expect, it } from "vitest";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Resource } from "@opentelemetry/resources";
import { createBuildWorker } from "./worker.js";
import type { ActivityDeps } from "./activities.js";

const temporalOn = process.env["TEMPORAL_INTEGRATION"] === "1";

/**
 * Worker.create compiles the workflow bundle — this proves the OTel workflow
 * interceptor module resolves and bundles, and that the sink accepts our
 * span processor (02 §9). Catching a bad module path here beats catching it
 * at worker boot in prod.
 */
describe.skipIf(!temporalOn)("createBuildWorker with OTel enabled", () => {
  it("bundles the workflow interceptor module and accepts the exporter sink", async () => {
    const env = await TestWorkflowEnvironment.createLocal();
    try {
      const worker = await createBuildWorker({
        connection: env.nativeConnection,
        taskQueue: "otel-bundle-check",
        // Activities are closures over deps, untouched by bundling — an
        // empty shape is fine for a create-only check.
        deps: {} as unknown as ActivityDeps,
        otel: {
          spanProcessor: new SimpleSpanProcessor(new InMemorySpanExporter()),
          resource: new Resource({ "service.name": "otel-bundle-check" }),
        },
      });
      expect(worker).toBeDefined();
    } finally {
      await env.teardown();
    }
  }, 180_000);
});
