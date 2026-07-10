import { and, asc, eq, gt } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { schema, type Db } from "@mullion/db";

const POLL_INTERVAL_MS = 1_000;
const HEARTBEAT_EVERY_MS = 15_000;
// Rate limits count requests, not held connections — without this cap a
// user could hold enough poll loops open to starve the pg pool.
const MAX_STREAMS_PER_USER = 5;
// Bounded lifetime; clients resume seamlessly via Last-Event-ID.
const MAX_STREAM_LIFETIME_MS = 30 * 60_000;

const activeStreamsByUser = new Map<string, number>();

export interface StreamArgs {
  db: Db;
  /** e.g. a planning session id (Phase 1), a run id (Phase 2). */
  streamId: string;
  /** Backfill is org-scoped — a stream never leaks across tenants (ADR-36). */
  organizationId: string;
  /** Holder of the connection, for the per-user concurrency cap. */
  userId: string;
}

/**
 * The reusable `GET /.../stream` pattern (ADR-18/19), built once here and
 * consumed by Phase 1 (planning) and Phase 2 (build progress).
 *
 * Events are written to stream_events first, streamed after — the table is
 * the source of truth, so a reconnect with `Last-Event-ID` replays exactly
 * the rows the client missed and then continues live. Live delivery is a
 * Postgres poll for now; if it needs to get cheaper later, swapping in
 * LISTEN/NOTIFY or Redis is contained to this function.
 */
export function streamEvents(c: Context, args: StreamArgs): Response {
  const held = activeStreamsByUser.get(args.userId) ?? 0;
  if (held >= MAX_STREAMS_PER_USER) {
    throw new HTTPException(429, { message: "Too many open streams" });
  }
  activeStreamsByUser.set(args.userId, held + 1);

  const lastEventIdHeader = c.req.header("Last-Event-ID");
  const parsedLastId = lastEventIdHeader ? Number.parseInt(lastEventIdHeader, 10) : 0;
  let cursor = Number.isFinite(parsedLastId) && parsedLastId > 0 ? parsedLastId : 0;

  const release = (): void => {
    const current = activeStreamsByUser.get(args.userId) ?? 1;
    if (current <= 1) {
      activeStreamsByUser.delete(args.userId);
    } else {
      activeStreamsByUser.set(args.userId, current - 1);
    }
  };

  return streamSSE(
    c,
    async (stream) => {
      const deadline = Date.now() + MAX_STREAM_LIFETIME_MS;
      let lastActivity = Date.now();
      try {
        while (!stream.aborted && !stream.closed && Date.now() < deadline) {
          const rows = await args.db
            .select()
            .from(schema.streamEvents)
            .where(
              and(
                eq(schema.streamEvents.streamId, args.streamId),
                eq(schema.streamEvents.organizationId, args.organizationId),
                gt(schema.streamEvents.id, cursor),
              ),
            )
            .orderBy(asc(schema.streamEvents.id))
            .limit(500);

          for (const row of rows) {
            await stream.writeSSE({
              id: String(row.id),
              event: sanitizeEventType(row.eventType),
              data: JSON.stringify(row.payload),
            });
            cursor = row.id;
            lastActivity = Date.now();
          }

          if (Date.now() - lastActivity >= HEARTBEAT_EVERY_MS) {
            // Keeps proxies from reaping an idle connection.
            await stream.writeSSE({ event: "heartbeat", data: String(Date.now()) });
            lastActivity = Date.now();
          }

          await stream.sleep(POLL_INTERVAL_MS);
        }
      } finally {
        release();
      }
    },
    async (error, stream) => {
      console.error(`SSE stream ${args.streamId} errored:`, error);
      await stream.close();
    },
  );
}

/**
 * A `\n` in the event field would let a producer forge extra SSE frames —
 * eventType is trusted-server-written today, but cheap to never rely on that.
 */
function sanitizeEventType(eventType: string): string {
  return eventType.replace(/[\r\n]/g, "_");
}

/** How producers publish: insert the event; connected streams pick it up. */
export async function publishStreamEvent(
  db: Db,
  args: {
    streamId: string;
    organizationId: string;
    eventType: string;
    payload: unknown;
  },
): Promise<void> {
  await db.insert(schema.streamEvents).values({
    streamId: args.streamId,
    organizationId: args.organizationId,
    eventType: sanitizeEventType(args.eventType),
    payload: args.payload,
  });
}
