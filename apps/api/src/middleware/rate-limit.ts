import type { HttpBindings } from "@hono/node-server";
import type { Context } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { env } from "../env.js";
import type { AuthVariables } from "./session.js";

// ADR-32: per-IP and per-user limits in front of every route, SSE included.
// MemoryStore is fine while the API is a single persistent process (02
// §7.1); swap to a Redis store when a second instance exists.

type Env = { Bindings: HttpBindings; Variables: AuthVariables };

function clientIp(c: Context<Env>): string {
  // x-forwarded-for is client-forgeable up to the first trusted proxy, so
  // trust is driven by TRUSTED_PROXY_HOPS: with 0 hops only the socket
  // address counts; with N, take the Nth entry from the RIGHT of the chain
  // (each trusted proxy appends the address it saw).
  const hops = env.TRUSTED_PROXY_HOPS;
  if (hops > 0) {
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) {
      const chain = forwarded.split(",").map((part) => part.trim());
      const candidate = chain[chain.length - hops];
      if (candidate) {
        return candidate;
      }
    }
  }
  return c.env.incoming.socket.remoteAddress ?? "unknown";
}

export const ipRateLimit = rateLimiter<Env>({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  keyGenerator: (c) => `ip:${clientIp(c)}`,
});

export const userRateLimit = rateLimiter<Env>({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  // Signed-in traffic is keyed by user id; anonymous falls back to IP so
  // the auth endpoints themselves stay covered.
  keyGenerator: (c) => {
    const user = c.get("user");
    return user ? `user:${user.id}` : `anon:${clientIp(c)}`;
  },
});
