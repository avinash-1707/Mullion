import { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { childLogger } from "@mullion/logger";
import { auth } from "./modules/auth/auth.js";
import { env } from "./config/env.js";
import { credentialRateLimit, ipRateLimit, userRateLimit } from "./middleware/rate-limit.js";
import { requestLogMiddleware } from "./middleware/request-log.js";
import { sessionMiddleware, type AuthVariables } from "./middleware/session.js";
import { tracingMiddleware } from "./middleware/tracing.js";
import { buildsRoute } from "./modules/builds/routes.js";
import { devRoute } from "./modules/dev/routes.js";
import { githubRoute } from "./modules/github/routes.js";
import { planningSessionsRoute } from "./modules/planning/routes.js";

/**
 * Builds the fully-wired Hono app (middleware + routes) WITHOUT any process
 * side effects — no serve(), no OTel bootstrap, no routing seed. index.ts
 * owns those; the route-test harness imports this and calls app.request()
 * against a real test DB. Keeping the two apart is what makes the HTTP
 * surface testable end to end.
 */
export function createApp(): Hono<{ Bindings: HttpBindings; Variables: AuthVariables }> {
  const app = new Hono<{ Bindings: HttpBindings; Variables: AuthVariables }>();

  app.use("*", tracingMiddleware);
  // After tracingMiddleware: the request span must be active so the
  // completion line carries trace_id (ADR-63).
  app.use("*", requestLogMiddleware());

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

  // CSRF gate: CORS only stops cross-origin *reads*, and a text/plain form
  // post skips preflight entirely — so state changes must check provenance
  // themselves rather than lean on the cookie's SameSite attribute (which
  // prod topology may force to None). Browser-less clients send neither
  // header and carry no ambient victim cookie, so they pass through.
  app.use("*", async (c, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const referer = c.req.header("Referer");
      // A malformed Referer is "no provenance", not a 500 (Phase 3 audit L2).
      let refererOrigin: string | undefined;
      try {
        refererOrigin = referer ? new URL(referer).origin : undefined;
      } catch {
        refererOrigin = undefined;
      }
      const origin = c.req.header("Origin") ?? refererOrigin;
      if (origin !== undefined && origin !== env.WEB_ORIGIN) {
        throw new HTTPException(403, { message: "Cross-origin request rejected" });
      }
    }
    await next();
  });

  // ADR-32: rate limits in front of every route, SSE endpoints included.
  app.use("*", ipRateLimit);
  app.use("*", sessionMiddleware);
  app.use("*", userRateLimit);

  app.get("/health", (c) => c.json({ ok: true }));

  // Better Auth owns /api/auth/* (sign-up, sign-in, org membership,
  // invitations, and later the GitHub linkSocial flow — ADR-22/23/36).
  // Credential endpoints ride a 10/min/IP window on top of the global limits.
  app.use("/api/auth/sign-in/*", credentialRateLimit);
  app.use("/api/auth/sign-up/*", credentialRateLimit);
  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

  app.route("/api/sessions", planningSessionsRoute);
  app.route("/api/builds", buildsRoute);
  app.route("/api/github", githubRoute);
  if (env.NODE_ENV !== "production") {
    // DoD probe only — spends real OpenRouter credits, never ships to prod.
    app.route("/api/dev", devRoute);
  }

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    childLogger({ module: "http" }).error({ err: error }, "unhandled request error");
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}
