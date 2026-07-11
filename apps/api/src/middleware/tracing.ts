import type { MiddlewareHandler } from "hono";
import { context, extractContext, getTracer, SpanStatusCode } from "@mullion/otel";

/**
 * Server span per request (02 §9), honoring an incoming W3C traceparent so
 * the web app (or a test harness) can stitch its trace to the API's. Named
 * by route pattern once matched — low-cardinality, not the raw path.
 * No-op provider unless the process started OTel.
 */
export const tracingMiddleware: MiddlewareHandler = async (c, next) => {
  const parent = extractContext({
    traceparent: c.req.header("traceparent"),
    tracestate: c.req.header("tracestate"),
  });
  await context.with(parent, () =>
    getTracer().startActiveSpan(
      `${c.req.method} ${c.req.path}`,
      { attributes: { "http.request.method": c.req.method } },
      async (span) => {
        try {
          await next();
          span.updateName(`${c.req.method} ${c.req.routePath}`);
          span.setAttributes({
            "http.route": c.req.routePath,
            "http.response.status_code": c.res.status,
          });
          if (c.res.status >= 500) {
            span.setStatus({ code: SpanStatusCode.ERROR });
          }
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
      },
    ),
  );
};
