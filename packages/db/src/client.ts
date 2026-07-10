import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export type Db = NodePgDatabase<typeof schema>;
/** Transaction handle — what a db.transaction callback receives. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Plain pg Pool over TCP — this is a persistent Node process (02 §7.1), so
 * Neon's HTTP/serverless driver buys nothing here. Point DATABASE_URL at
 * Neon's pooled connection string.
 */
export function createDb(databaseUrl: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 20,
    // Fail fast on pool exhaustion instead of queueing forever — an
    // unbounded wait turns one slow query into a whole-API stall.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 30_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  // node-postgres emits 'error' for idle clients dropped by the server
  // (routine with Neon); without a listener that's an uncaught exception.
  pool.on("error", (error) => {
    console.error("pg pool idle client error:", error);
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
