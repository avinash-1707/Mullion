import { serve } from "@hono/node-server";
import { initLogger } from "@mullion/logger";
import { startOtel } from "@mullion/otel";
import { seedModelRouting } from "@mullion/llm";
import { createApp } from "./app.js";
import { db, pool } from "./lib/db.js";
import { env } from "./config/env.js";

// Logger first (ADR-63) so even OTel bootstrap failures log structured;
// startOtel registers the context manager the trace_id mixin reads.
const log = initLogger({
  service: "mullion-api",
  level: env.LOG_LEVEL,
  pretty: env.LOG_FORMAT === "pretty",
});
// Export is a no-op without OTEL_EXPORTER_OTLP_ENDPOINT (02 §9) — before any traffic.
await startOtel({ serviceName: "mullion-api" });

const app = createApp();

await seedModelRouting(db);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  log.info({ port: info.port }, "API listening");
});

function shutdown(): void {
  server.close(() => {
    // flush(cb) so the pino-pretty worker thread (dev) drains before exit;
    // prod JSON writes synchronously and the callback fires immediately.
    log.flush(() => {
      void pool.end().finally(() => process.exit(0));
    });
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
