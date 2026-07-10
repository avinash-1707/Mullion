import { serve, type HttpBindings } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { seedModelRouting } from "@mullion/llm";
import { auth } from "./auth.js";
import { db, pool } from "./db.js";
import { env } from "./env.js";
import { ipRateLimit, userRateLimit } from "./middleware/rate-limit.js";
import { sessionMiddleware, type AuthVariables } from "./middleware/session.js";
import { devRoute } from "./routes/dev.js";
import { planningSessionsRoute } from "./routes/planning-sessions.js";

const app = new Hono<{ Bindings: HttpBindings; Variables: AuthVariables }>();

app.use(logger());

// CORS before everything that answers — Better Auth's cookies need
// credentials:true from the exact Next.js origin (02 §7.1.1); `*` is
// rejected by browsers when credentials are on.
app.use(
  "*",
  cors({
    origin: env.WEB_ORIGIN,
    allowHeaders: ["Content-Type", "Authorization", "Last-Event-ID"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

// ADR-32: rate limits in front of every route, SSE endpoints included.
app.use("*", ipRateLimit);
app.use("*", sessionMiddleware);
app.use("*", userRateLimit);

app.get("/health", (c) => c.json({ ok: true }));

// Better Auth owns /api/auth/* (sign-up, sign-in, org membership,
// invitations, and later the GitHub linkSocial flow — ADR-22/23/36).
app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.route("/api/sessions", planningSessionsRoute);
if (env.NODE_ENV !== "production") {
  // DoD probe only — spends real OpenRouter credits, never ships to prod.
  app.route("/api/dev", devRoute);
}

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return error.getResponse();
  }
  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
});

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
