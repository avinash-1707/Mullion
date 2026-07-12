"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Select, type SelectOption } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatJoinedDate } from "@/lib/format";
import { roleLabel, type OrgMember, type OrgRole } from "@/lib/organizations-api";
import { useUpdateMemberRoleMutation, useRemoveMemberMutation } from "@/hooks/use-org-members";
import { FormNote } from "./form-note";

interface MemberRowProps {
  member: OrgMember;
  canManage: boolean;
  isSelf: boolean;
}

const ROLE_OPTIONS: SelectOption[] = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
];

// One row per member — structural sibling of model-role-row.tsx (own
// mutation instances) and connected-accounts-section.tsx's row shape
// (identity + status/control on the right). Every row gets the role Select
// when canManage — there is no static "Owner" tag; roles are admin/member
// only.
export function MemberRow({ member, canManage, isSelf }: MemberRowProps) {
  const updateRole = useUpdateMemberRoleMutation();
  const removeMember = useRemoveMemberMutation();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [selfDemoteOpen, setSelfDemoteOpen] = useState(false);
  const [pendingSelfRole, setPendingSelfRole] = useState<OrgRole | null>(null);
  const busy = updateRole.isPending || removeMember.isPending;

  function handleRoleChange(nextValue: string) {
    const role = nextValue as OrgRole;
    if (role === member.role) return;
    // Demoting yourself out of admin can take your own canManage rights
    // away mid-tab — the one role change in this feature routed through a
    // confirm instead of committing immediately (every other row follows
    // useUpdateModelMutation's immediate-optimistic convention). Only
    // reachable for self since canManage implies you're currently admin.
    if (isSelf && member.role === "admin" && role === "member") {
      setPendingSelfRole(role);
      setSelfDemoteOpen(true);
      return;
    }
    updateRole.mutate({ memberId: member.id, role });
  }

  function handleConfirmSelfDemote() {
    if (!pendingSelfRole) return;
    updateRole.mutate({ memberId: member.id, role: pendingSelfRole }, { onSuccess: () => setSelfDemoteOpen(false) });
  }

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={member.name} email={member.email} image={member.image} />
        <div className="min-w-0">
          <p className="truncate text-sm text-fg">
            {member.name}
            {isSelf ? <span className="text-fg-faint"> (you)</span> : null}
          </p>
          <p className="truncate font-mono text-xs text-fg-muted">{member.email}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 sm:gap-4">
        <span className="font-mono text-xs text-fg-faint">Joined {formatJoinedDate(member.createdAt)}</span>

        {canManage ? (
          <div className="w-32">
            <Select
              fieldId={`member-role-${member.id}`}
              aria-label={`Role for ${member.name}`}
              value={member.role}
              onChange={handleRoleChange}
              disabled={busy}
              options={ROLE_OPTIONS}
            />
          </div>
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
            {roleLabel(member.role)}
          </span>
        )}

        {canManage && !isSelf ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setRemoveOpen(true)}>
            Remove
          </Button>
        ) : null}
      </div>

      {updateRole.isError ? (
        <div className="sm:w-full">
          <FormNote>{updateRole.error.message}</FormNote>
        </div>
      ) : null}
      {removeMember.isError ? (
        <div className="sm:w-full">
          <FormNote>{removeMember.error.message}</FormNote>
        </div>
      ) : null}

      <ConfirmDialog
        open={removeOpen}
        pending={removeMember.isPending}
        onCancel={() => setRemoveOpen(false)}
        onConfirm={() => removeMember.mutate(member.id, { onSuccess: () => setRemoveOpen(false) })}
        title="Remove this member?"
        description={<>{member.name} will lose access to this organization immediately.</>}
        confirmLabel="Remove member"
        pendingLabel="Removing…"
      />

      <ConfirmDialog
        open={selfDemoteOpen}
        pending={updateRole.isPending}
        onCancel={() => setSelfDemoteOpen(false)}
        onConfirm={handleConfirmSelfDemote}
        title="Change your own role?"
        description="You'll lose admin access to this tab — someone else with admin will need to promote you back."
        confirmLabel="Change role"
        pendingLabel="Changing…"
      />
    </li>
  );
}
