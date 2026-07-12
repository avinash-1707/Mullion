import { z } from "zod";

// Local schemas for /api/org/* — no second caller exists yet outside this
// app, so these stay here rather than in @mullion/schemas per
// CODING_STANDARDS §8 ("one schema per route... until a second caller
// exists"), the same reasoning settings-api.ts documents for its own
// locally-owned shapes. Every response is parsed here before a component
// ever sees it (CODING_STANDARDS §1: zod at the trust boundary).

export const ORG_ROLES = ["admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const orgMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  role: z.enum(ORG_ROLES),
  createdAt: z.string(),
});
export type OrgMember = z.infer<typeof orgMemberSchema>;

// Better Auth's usual invitation lifecycle. "Expired" is deliberately NOT a
// member of this set — it's never a stored status (see
// pendingInviteDisplayStatus below), it's derived from expiresAt.
export const invitationStatusSchema = z.enum(["pending", "accepted", "rejected", "canceled"]);

export const orgInvitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.enum(ORG_ROLES),
  status: invitationStatusSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type OrgInvitation = z.infer<typeof orgInvitationSchema>;

export const orgMembersResponseSchema = z.object({
  canManage: z.boolean(),
  members: z.array(orgMemberSchema),
  invitations: z.array(orgInvitationSchema),
});
export type OrgMembersResponse = z.infer<typeof orgMembersResponseSchema>;

// GET /api/org/invitations/:id/preview is unauthenticated, so it pre-derives
// "expired"/"revoked" server-side rather than shipping raw status+expiresAt
// to an anonymous caller — this schema mirrors that exactly; UI must NOT
// recompute expiry from expiresAt on this endpoint (unlike the authenticated
// members list below, which does).
export const invitationPreviewStatusSchema = z.enum(["pending", "expired", "revoked", "accepted"]);

export const invitationPreviewSchema = z.object({
  orgName: z.string(),
  inviterName: z.string(),
  invitedEmail: z.string(),
  status: invitationPreviewStatusSchema,
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

const ROLE_LABELS: Record<OrgRole, string> = {
  admin: "Admin",
  member: "Member",
};

export function roleLabel(role: OrgRole): string {
  return ROLE_LABELS[role];
}

export type PendingInviteDisplayStatus = "pending" | "expired";

// GET /api/org/members returns raw status/expiresAt (unlike the
// unauthenticated preview endpoint, which pre-derives this) — the pending
// list computes "expired" itself so a lapsed invite still shows, with
// Resend, instead of silently vanishing at the exact expiresAt instant.
export function pendingInviteDisplayStatus(invitation: OrgInvitation): PendingInviteDisplayStatus {
  return new Date(invitation.expiresAt).getTime() < Date.now() ? "expired" : "pending";
}

// Better Auth's organization.metadata is a free-form JSON value — stored as
// a JSON string in Postgres (packages/db/src/schema/auth.ts) but the client
// SDK may hand it back already-parsed depending on version, so this reads
// defensively rather than assuming either shape.
export function isPersonalOrg(metadata: unknown): boolean {
  if (!metadata) return false;
  if (typeof metadata === "string") {
    try {
      const parsed: unknown = JSON.parse(metadata);
      return Boolean(parsed && typeof parsed === "object" && (parsed as { personal?: unknown }).personal === true);
    } catch {
      return false;
    }
  }
  if (typeof metadata === "object") {
    return (metadata as { personal?: unknown }).personal === true;
  }
  return false;
}
