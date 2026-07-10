import { createDb } from "@mullion/db";
import { env } from "./env.js";

export const { db, pool } = createDb(env.DATABASE_URL);
