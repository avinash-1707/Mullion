import { createDb } from "@mullion/db";
import { env } from "../config/env.js";

export const { db, pool } = createDb(env.DATABASE_URL);
