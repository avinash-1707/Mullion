import crypto from "node:crypto";
import { schema, type Db } from "@mullion/db";

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
      role: "owner",
    });
    return org.id;
  });
}
