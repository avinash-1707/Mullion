"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatRelativeExpiry } from "@/lib/format";
import { roleLabel, pendingInviteDisplayStatus, type OrgInvitation } from "@/lib/organizations-api";
import { useInviteMemberMutation, useRevokeInvitationMutation } from "@/hooks/use-org-members";
import { FormNote } from "./form-note";

interface PendingInviteRowProps {
  invitation: OrgInvitation;
  canManage: boolean;
}

// Resend re-invites the same email+role — the server treats a repeat
// invite to a pending address as "cancel the old one, issue a new one",
// so this row's Resend button is just useInviteMemberMutation called with
// this invitation's own fields, not a distinct endpoint. Revoke is hidden
// once expired: there's nothing live left to cancel, and Resend is already
// the row's one meaningful action at that point.
export function PendingInviteRow({ invitation, canManage }: PendingInviteRowProps) {
  const resend = useInviteMemberMutation();
  const revoke = useRevokeInvitationMutation();
  const [revokeOpen, setRevokeOpen] = useState(false);
  const expired = pendingInviteDisplayStatus(invitation) === "expired";

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="truncate text-sm text-fg">{invitation.email}</p>
        <p className="font-mono text-xs text-fg-faint">
          {roleLabel(invitation.role)} · {expired ? "Expired" : formatRelativeExpiry(invitation.expiresAt)}
        </p>
      </div>

      {canManage ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={resend.isPending}
            onClick={() => resend.mutate({ email: invitation.email, role: invitation.role })}
          >
            {resend.isPending ? "Resending…" : "Resend"}
          </Button>
          {!expired ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setRevokeOpen(true)}>
              Revoke
            </Button>
          ) : null}
        </div>
      ) : null}

      {resend.error ? (
        <div className="sm:w-full">
          <FormNote>{resend.error.message}</FormNote>
        </div>
      ) : null}
      {revoke.error ? (
        <div className="sm:w-full">
          <FormNote>{revoke.error.message}</FormNote>
        </div>
      ) : null}

      <ConfirmDialog
        open={revokeOpen}
        pending={revoke.isPending}
        onCancel={() => setRevokeOpen(false)}
        onConfirm={() => revoke.mutate(invitation.id, { onSuccess: () => setRevokeOpen(false) })}
        title="Revoke this invitation?"
        description={<>{invitation.email} won&rsquo;t be able to accept it anymore.</>}
        confirmLabel="Revoke invite"
        pendingLabel="Revoking…"
      />
    </li>
  );
}
