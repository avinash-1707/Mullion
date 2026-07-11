import type { MiddlewareHandler } from "hono";
import { childLogger, type Logger } from "@mullion/logger";

/**
 * Request-completion log line (ADR-63), replacing hono/logger: structured
 * JSON with method/route/status/duration_ms, and trace_id/span_id via the
 * logger's mixin — which is why this must sit AFTER tracingMiddleware, so
 * the request's server span is active when the line is emitted. Routes log
 * by matched route pattern (low-cardinality), not the raw path.
 */
export function requestLogMiddleware(): MiddlewareHandler {
  // Created per app instance, not at module scope: module scope would bind
  // to the fallback root before index.ts runs initLogger().
  let log: Logger | undefined;
  return async (c, next) => {
    log ??= childLogger({ module: "http" });
    const start = performance.now();
    try {
      await next();
    } finally {
      log.info(
        {
          method: c.req.method,
          route: c.req.routePath,
          status: c.res.status,
          duration_ms: Math.round(performance.now() - start),
        },
        "request",
      );
    }
  };
}
