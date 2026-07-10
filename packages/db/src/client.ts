import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export type Db = NodePgDatabase<typeof schema>;

/**
 * Plain pg Pool over TCP — this is a persistent Node process (02 §7.1), so
 * Neon's HTTP/serverless driver buys nothing here. Point DATABASE_URL at
 * Neon's pooled connection string.
 */
export function createDb(databaseUrl: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
