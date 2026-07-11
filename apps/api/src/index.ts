import { serve } from "@hono/node-server";
import { startOtel } from "@mullion/otel";
import { seedModelRouting } from "@mullion/llm";
import { createApp } from "./app.js";
import { db, pool } from "./db.js";
import { env } from "./env.js";

// No-op without OTEL_EXPORTER_OTLP_ENDPOINT (02 §9) — before any traffic.
await startOtel({ serviceName: "mullion-api" });

const app = createApp();

await seedModelRouting(db);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on :${info.port}`);
});

function shutdown(): void {
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
