/**
 * Process-level OTel bootstrap (02 §9). Must be imported (and awaited)
 * before any traced work happens in the process.
 *
 * Deliberately a no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set (and
 * OTEL_SDK_DISABLED isn't): with no SDK started, @opentelemetry/api keeps
 * its built-in no-op provider, so instrumented code costs nothing and local
 * dev needs no collector. The heavy SDK packages are dynamically imported
 * only when tracing is actually on.
 */

interface StartedOtel {
  shutdown: () => Promise<void>;
}

export async function startOtel(args: { serviceName: string }): Promise<StartedOtel | undefined> {
  if (!process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] || process.env["OTEL_SDK_DISABLED"] === "true") {
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
      console.error("OTel shutdown failed", error);
    });
  };
  process.once("SIGTERM", () => {
    void shutdown();
  });
  return { shutdown };
}
