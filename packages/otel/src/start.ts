import { childLogger } from "@mullion/logger";

/**
 * Process-level OTel bootstrap (02 §9). Must be imported (and awaited)
 * before any traced work happens in the process.
 *
 * Export is a no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set (and
 * OTEL_SDK_DISABLED isn't): with no NodeSDK started, nothing leaves the
 * process and local dev needs no collector. The heavy SDK packages are
 * dynamically imported only when tracing is actually on.
 *
 * Even without an endpoint, a bare exporterless tracer provider + context
 * manager IS registered (ADR-63): @opentelemetry/api's built-in no-op
 * provider produces no span contexts, so without this the logger's
 * trace_id mixin would stamp nothing in local dev — defeating the point
 * of trace-correlated logs. OTEL_SDK_DISABLED=true skips even that.
 */

interface StartedOtel {
  shutdown: () => Promise<void>;
}

let bareProviderRegistered = false;

export async function startOtel(args: { serviceName: string }): Promise<StartedOtel | undefined> {
  if (process.env["OTEL_SDK_DISABLED"] === "true") {
    return undefined;
  }

  if (!process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]) {
    if (!bareProviderRegistered) {
      const [{ context, trace }, { AsyncHooksContextManager }, { BasicTracerProvider }] =
        await Promise.all([
          import("@opentelemetry/api"),
          import("@opentelemetry/context-async-hooks"),
          import("@opentelemetry/sdk-trace-base"),
        ]);
      context.setGlobalContextManager(new AsyncHooksContextManager().enable());
      // No span processor: spans get real trace/span ids for log correlation
      // but are never batched or exported.
      trace.setGlobalTracerProvider(new BasicTracerProvider());
      bareProviderRegistered = true;
    }
    return undefined;
  }

  const [{ NodeSDK }, { OTLPTraceExporter }, { UndiciInstrumentation }] = await Promise.all([
    import("@opentelemetry/sdk-node"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/instrumentation-undici"),
  ]);

  const sdk = new NodeSDK({
    serviceName: args.serviceName,
    // Exporter endpoint/headers/protocol come from the standard OTEL_* env
    // vars — no Mullion-specific config layer on top.
    traceExporter: new OTLPTraceExporter(),
    // Undici hooks via diagnostics_channel, so outbound fetch (OpenRouter,
    // Better Auth callbacks, GitHub) gets client spans + traceparent
    // injection even under tsx's ESM loader, where require-patching
    // instrumentations are unreliable.
    instrumentations: [new UndiciInstrumentation()],
  });
  sdk.start();

  const shutdown = async (): Promise<void> => {
    await sdk.shutdown().catch((error: unknown) => {
      childLogger({ module: "otel" }).error({ err: error }, "OTel shutdown failed");
    });
  };
  process.once("SIGTERM", () => {
    void shutdown();
  });
  return { shutdown };
}
