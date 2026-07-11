# @mullion/otel

> Shared OpenTelemetry setup: process bootstrap plus span helpers that are safe to call even when tracing is off (spec 02 §9).

## High-level idea

Instrumentation is written once and is always on. Whether spans go anywhere is a deployment decision. `startOtel({ serviceName })` is a no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and the heavy SDK packages are only imported when it is. `withSpan` works against the global tracer either way, so untraced processes pay near-zero cost.

One non-obvious piece: Temporal workflows run in an isolated V8 context that cannot reach the NodeSDK. `createWorkerOtelParts` builds a span processor and resource for Temporal's workflow-sandbox exporter sink. That is how traces cross into workflow code.

## Layout

| File | What |
|---|---|
| `src/start.ts` | `startOtel`: NodeSDK bootstrap. Wires Undici instrumentation for outbound fetch spans and traceparent injection |
| `src/span.ts` | `withSpan`, `getTracer`, `currentTraceId`, `extractContext` / `injectContext`. Re-exports `context`, `trace`, `propagation`, `SpanStatusCode` |
| `src/worker-parts.ts` | `createWorkerOtelParts` for the Temporal workflow sandbox |

## Exports

`startOtel`, `createWorkerOtelParts` / `WorkerOtelParts`, and the span helpers and types above.

## Configuration

Driven entirely by the standard `OTEL_*` env vars (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SDK_DISABLED`, exporter headers and protocol). No endpoint means tracing is off.

## Where it fits

Imported **first** by `apps/api`'s `index.ts` and `worker.ts`, before any traffic. `withSpan` is used across llm, agents, orchestrator, and db.

## Testing

Vitest: `span.test.ts`. `pnpm test`.
