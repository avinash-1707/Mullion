import crypto from "node:crypto";
import { APIError } from "better-auth";
import { eq, sql } from "drizzle-orm";
import { schema, type Db } from "@mullion/db";

export const ORG_ROLES = ["admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/**
 * ADR-72: admin and member are the only org roles. Better Auth's
 * parseRoles accepts arbitrary strings and comma-joined lists on raw
 * invite/update calls, so every role that enters the system must pass
 * this gate — it is the enforcement, not the zod enums on custom routes.
 */
export function assertOrgRole(role: string): asserts role is OrgRole {
  if (!(ORG_ROLES as readonly string[]).includes(role)) {
    throw new APIError("BAD_REQUEST", { message: "Role must be admin or member" });
  }
}

function personalOrgSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "workspace"}-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * ADR-36/37: create the personal organization + owner membership as one
 * transaction — a half-provisioned tenant (org without member) would
 * permanently lock the user out. Called from the signup hook and, as
 * recovery, from the membership middleware when a signed-in user somehow
 * has zero memberships.
 */
export async function provisionPersonalOrg(
  db: Db,
  user: { id: string; name: string },
): Promise<string> {
  return db.transaction(async (tx) => {
    // Two concurrent zero-membership requests would otherwise both
    // provision — a member unique index can't stop that (two distinct org
    // ids). Serialize per user and re-check inside the lock.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`personal-org:${user.id}`}, 0))`);
    const existing = await tx
      .select({ organizationId: schema.member.organizationId })
      .from(schema.member)
      .where(eq(schema.member.userId, user.id))
      .limit(1);
    const existingOrgId = existing[0]?.organizationId;
    if (existingOrgId) {
      return existingOrgId;
    }
    const [org] = await tx
      .insert(schema.organization)
      .values({
        id: crypto.randomUUID(),
        name: `${user.name}'s Workspace`,
        slug: personalOrgSlug(user.name),
        metadata: JSON.stringify({ personal: true }),
      })
      .returning();
    if (!org) {
      throw new Error(`Personal organization insert returned no row for user ${user.id}`);
    }
    await tx.insert(schema.member).values({
      id: crypto.randomUUID(),
      userId: user.id,
      organizationId: org.id,
      // ADR-72: two-role model — the creator is simply the first admin.
      role: "admin",
    });
    return org.id;
  });
}
