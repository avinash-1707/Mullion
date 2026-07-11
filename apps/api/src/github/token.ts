import { and, eq } from "drizzle-orm";
import { schema } from "@mullion/db";
import { db } from "../db.js";

/**
 * Read a user's linked GitHub access token (ADR-56). Per-user (ADR-36),
 * scope `repo`, read only at delivery time. GitHub OAuth Apps issue no
 * refresh token and the token doesn't expire, so a plain read of Better
 * Auth's `account` row is sufficient — no refresh flow.
 */
export async function getGitHubAccessToken(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ accessToken: schema.account.accessToken })
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "github")))
    .limit(1);
  return row?.accessToken ?? null;
}

export async function getGitHubConnection(
  userId: string,
): Promise<{ connected: boolean; scopes: string[] }> {
  const [row] = await db
    .select({ accessToken: schema.account.accessToken, scope: schema.account.scope })
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, "github")))
    .limit(1);
  return {
    connected: Boolean(row?.accessToken),
    scopes: row?.scope ? row.scope.split(",").map((s) => s.trim()).filter(Boolean) : [],
  };
}
