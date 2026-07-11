import {
  context,
  propagation,
  SpanStatusCode,
  trace,
  type Attributes,
  type Context,
  type Span,
} from "@opentelemetry/api";

/**
 * Thin helpers over @opentelemetry/api (02 §9). The api package is a no-op
 * until a process calls startOtel(), so every instrumented package can use
 * these unconditionally — untraced processes pay a near-zero cost and tests
 * need no tracing setup.
 */

const TRACER_NAME = "mullion";

export function getTracer(): ReturnType<typeof trace.getTracer> {
  return trace.getTracer(TRACER_NAME);
}

/**
 * Run `fn` inside an active span: errors are recorded + re-thrown, the span
 * always ends. The standard shape for every agent call and tool invocation.
 */
export async function withSpan<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return getTracer().startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      if (error instanceof Error) span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

/** The active trace id, if any — for stamping onto stream events / logs. */
export function currentTraceId(): string | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext && spanContext.traceId !== "00000000000000000000000000000000"
    ? spanContext.traceId
    : undefined;
}

/** Extract W3C trace context from an incoming carrier (e.g. HTTP headers). */
export function extractContext(carrier: Record<string, string | undefined>): Context {
  return propagation.extract(context.active(), carrier);
}

/** Inject the active trace context into an outgoing carrier. */
export function injectContext(carrier: Record<string, string>): void {
  propagation.inject(context.active(), carrier);
}

export { context, propagation, SpanStatusCode, trace };
export type { Attributes, Context, Span };
