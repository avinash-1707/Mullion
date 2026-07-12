import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { schema, type Db } from "@mullion/db";
import { db } from "../../lib/db.js";
import {
  canManage,
  requireOrgAdmin,
  requireOrgMember,
  type RequiredAuthVariables,
} from "../../middleware/session.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const patchMemberSchema = z.object({
  role: z.enum(["admin", "member"]),
});

/**
 * ADR-72: an org must never drop to zero admins. The count and the mutation
 * run in one transaction under a per-org advisory lock — two concurrent
 * demotes would otherwise each see "2 admins" and both proceed. "owner"
 * counts as admin until the owner→admin migration has zeroed those rows.
 */
async function lockOrgAdmins(tx: Tx, organizationId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`org-admins:${organizationId}`}, 0))`,
  );
}

async function remainingAdminCount(
  tx: Tx,
  organizationId: string,
  excludingMemberId: string,
): Promise<number> {
  const rows = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        inArray(schema.member.role, ["admin", "owner"]),
        ne(schema.member.id, excludingMemberId),
      ),
    );
  return rows[0]?.n ?? 0;
}

function isPersonalOrg(metadata: string | null): boolean {
  if (!metadata) return false;
  try {
    return Boolean((JSON.parse(metadata) as { personal?: boolean }).personal);
  } catch {
    return false;
  }
}

/**
 * Invite preview — deliberately UNAUTHENTICATED (ADR-72): the accept page
 * must render "who invited you, to what" before the sign-in wall (ADR-35).
 * Minimal payload, and acceptance itself still requires an authenticated
 * session whose email matches the invitation, so the id is not a bearer
 * secret. Status is derived server-side; expiry never mutates the row.
 */
const previewRoute = new Hono().get("/invitations/:id/preview", async (c) => {
  const rows = await db
    .select({
      status: schema.invitation.status,
      expiresAt: schema.invitation.expiresAt,
      email: schema.invitation.email,
      orgName: schema.organization.name,
      inviterName: schema.user.name,
    })
    .from(schema.invitation)
    .innerJoin(schema.organization, eq(schema.invitation.organizationId, schema.organization.id))
    .innerJoin(schema.user, eq(schema.invitation.inviterId, schema.user.id))
    .where(eq(schema.invitation.id, c.req.param("id")))
    .limit(1);
  const invite = rows[0];
  if (!invite) {
    throw new HTTPException(404, { message: "Invitation not found" });
  }
  const status =
    invite.status === "accepted"
      ? "accepted"
      : invite.status !== "pending"
        ? "revoked"
        : invite.expiresAt.getTime() <= Date.now()
          ? "expired"
          : "pending";
  return c.json({
    orgName: invite.orgName,
    inviterName: invite.inviterName,
    invitedEmail: invite.email,
    status,
  });
});

/**
 * Member management (ADR-72). Reads open to every member; mutations
 * admin-only. Only the ops that can change the org's admin count live here —
 * invite/revoke/accept/rename ride Better Auth's own org endpoints. Leave is
 * custom because Better Auth's leave endpoint skips the remove hooks, so no
 * hook-based guard can protect it.
 */
const memberRoutes = new Hono<{ Variables: RequiredAuthVariables }>()
  .use(requireOrgMember)

  .get("/members", async (c) => {
    const organizationId = c.get("organizationId");
    const [members, invitations] = await Promise.all([
      db
        .select({
          id: schema.member.id,
          userId: schema.member.userId,
          name: schema.user.name,
          email: schema.user.email,
          image: schema.user.image,
          role: schema.member.role,
          createdAt: schema.member.createdAt,
        })
        .from(schema.member)
        .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
        .where(eq(schema.member.organizationId, organizationId))
        .orderBy(asc(schema.member.createdAt), asc(schema.member.id)),
      db
        .select({
          id: schema.invitation.id,
          email: schema.invitation.email,
          role: schema.invitation.role,
          status: schema.invitation.status,
          expiresAt: schema.invitation.expiresAt,
          createdAt: schema.invitation.createdAt,
        })
        .from(schema.invitation)
        .where(eq(schema.invitation.organizationId, organizationId))
        .orderBy(asc(schema.invitation.createdAt), asc(schema.invitation.id)),
    ]);
    return c.json({ canManage: canManage(c.get("orgRole")), members, invitations });
  })

  .patch(
    "/members/:memberId",
    requireOrgAdmin,
    zValidator("json", patchMemberSchema),
    async (c) => {
      const organizationId = c.get("organizationId");
      const memberId = c.req.param("memberId");
      const { role } = c.req.valid("json");
      await db.transaction(async (tx) => {
        await lockOrgAdmins(tx, organizationId);
        const [target] = await tx
          .select({ id: schema.member.id, role: schema.member.role })
          .from(schema.member)
          .where(
            and(eq(schema.member.id, memberId), eq(schema.member.organizationId, organizationId)),
          )
          .limit(1);
        if (!target) {
          throw new HTTPException(404, { message: "Member not found" });
        }
        const demotingAdmin = canManage(target.role) && role === "member";
        if (demotingAdmin && (await remainingAdminCount(tx, organizationId, memberId)) === 0) {
          throw new HTTPException(409, {
            message: "An organization must keep at least one admin — promote someone else first",
          });
        }
        await tx.update(schema.member).set({ role }).where(eq(schema.member.id, memberId));
      });
      return c.json({ ok: true });
    },
  )

  .delete("/members/:memberId", requireOrgAdmin, async (c) => {
    const organizationId = c.get("organizationId");
    const memberId = c.req.param("memberId");
    await db.transaction(async (tx) => {
      await lockOrgAdmins(tx, organizationId);
      const [target] = await tx
        .select({ id: schema.member.id, role: schema.member.role })
        .from(schema.member)
        .where(
          and(eq(schema.member.id, memberId), eq(schema.member.organizationId, organizationId)),
        )
        .limit(1);
      if (!target) {
        throw new HTTPException(404, { message: "Member not found" });
      }
      if (canManage(target.role) && (await remainingAdminCount(tx, organizationId, memberId)) === 0) {
        throw new HTTPException(409, {
          message: "An organization must keep at least one admin — promote someone else first",
        });
      }
      // The removed user's in-flight session/build ages out (ADR-72): their
      // next request 403s at requireOrgMember and their session heals to the
      // personal org — no session write needed here.
      await tx.delete(schema.member).where(eq(schema.member.id, memberId));
    });
    return c.json({ ok: true });
  })

  .post("/leave", async (c) => {
    const organizationId = c.get("organizationId");
    const user = c.get("user");
    await db.transaction(async (tx) => {
      await lockOrgAdmins(tx, organizationId);
      const rows = await tx
        .select({
          memberId: schema.member.id,
          role: schema.member.role,
          metadata: schema.organization.metadata,
        })
        .from(schema.member)
        .innerJoin(schema.organization, eq(schema.member.organizationId, schema.organization.id))
        .where(
          and(
            eq(schema.member.userId, user.id),
            eq(schema.member.organizationId, organizationId),
          ),
        )
        .limit(1);
      const self = rows[0];
      if (!self) {
        throw new HTTPException(404, { message: "Membership not found" });
      }
      if (isPersonalOrg(self.metadata)) {
        throw new HTTPException(400, { message: "You can't leave your personal workspace" });
      }
      if (
        canManage(self.role) &&
        (await remainingAdminCount(tx, organizationId, self.memberId)) === 0
      ) {
        throw new HTTPException(409, {
          message: "You're the last admin — promote someone else first",
        });
      }
      await tx.delete(schema.member).where(eq(schema.member.id, self.memberId));
      // Point the leaver's live sessions back at nothing; the middleware
      // heals to their oldest remaining membership (the personal org).
      await tx
        .update(schema.session)
        .set({ activeOrganizationId: null })
        .where(
          and(
            eq(schema.session.userId, user.id),
            eq(schema.session.activeOrganizationId, organizationId),
          ),
        );
    });
    return c.json({ ok: true });
  });

export const orgRoute = new Hono().route("/", previewRoute).route("/", memberRoutes);
