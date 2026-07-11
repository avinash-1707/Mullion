import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { streamSSE } from "hono/streaming";
import { schema, type Db, type Tx } from "@mullion/db";

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
  /**
   * Re-checked periodically during the (up to 30-min) stream so revoking a
   * membership doesn't keep delivering events until the lifetime cap.
   * Return false to end the stream.
   */
  assertAccess?: (() => Promise<boolean>) | undefined;
}

const ACCESS_RECHECK_MS = 60_000;

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

  // Browsers only send Last-Event-ID on automatic reconnects — a fresh
  // EventSource can't set headers, so page loads that already hold a
  // snapshot pass the cursor as a query param instead.
  const lastEventIdRaw = c.req.header("Last-Event-ID") ?? c.req.query("lastEventId");
  const parsedLastId = lastEventIdRaw ? Number.parseInt(lastEventIdRaw, 10) : 0;
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
      let lastAccessCheck = Date.now();
      try {
        while (!stream.aborted && !stream.closed && Date.now() < deadline) {
          if (args.assertAccess && Date.now() - lastAccessCheck >= ACCESS_RECHECK_MS) {
            lastAccessCheck = Date.now();
            if (!(await args.assertAccess())) break;
          }
          const rows = await args.db
            .select({
              id: schema.streamEvents.id,
              eventType: schema.streamEvents.eventType,
              payload: schema.streamEvents.payload,
            })
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

          // A full page means there's likely more backfill — drain it
          // immediately instead of trickling at 500 rows/sec.
          if (rows.length < 500) {
            await stream.sleep(POLL_INTERVAL_MS);
          }
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

// Large artifacts belong in S3 with a reference in the event, not inline —
// the payload is re-read by every poll of every connected client.
const MAX_PAYLOAD_BYTES = 64 * 1024;

/**
 * How producers publish: insert the event; connected streams pick it up.
 *
 * Accepts a transaction handle so callers can pair the event with the write
 * it announces (02 §2.3: node emission + decision-log row commit together).
 *
 * ADR-38: the per-stream advisory lock serializes commit order within a
 * stream. Without it, ids are assigned at insert but become visible at
 * commit — a slow commit could surface an id the poll cursor has already
 * passed, and that event would never be delivered.
 */
export async function publishStreamEvent(
  db: Db | Tx,
  args: {
    streamId: string;
    organizationId: string;
    eventType: string;
    payload: unknown;
  },
): Promise<void> {
  const serialized = JSON.stringify(args.payload);
  // Byte length, not UTF-16 code units — multi-byte content must not slip
  // past the cap (or trip it spuriously).
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw new Error(
      `Stream event payload exceeds ${MAX_PAYLOAD_BYTES} bytes (${bytes}) — store the artifact and reference it instead`,
    );
  }
  const insert = async (tx: Tx): Promise<void> => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${args.streamId}, 0))`);
    await tx.insert(schema.streamEvents).values({
      streamId: args.streamId,
      organizationId: args.organizationId,
      eventType: sanitizeEventType(args.eventType),
      payload: args.payload,
    });
  };
  if (isTx(db)) {
    await insert(db);
  } else {
    await db.transaction(insert);
  }
}

function isTx(db: Db | Tx): db is Tx {
  return "rollback" in db;
}
