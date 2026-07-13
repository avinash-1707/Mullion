"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { DropdownMenu, type DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { formatJoinedDate } from "@/lib/format";
import { roleLabel, type OrgMember, type OrgRole } from "@/lib/organizations-api";
import { useUpdateMemberRoleMutation, useRemoveMemberMutation } from "@/hooks/use-org-members";
import { FormNote } from "./form-note";

interface MemberRowProps {
  member: OrgMember;
  canManage: boolean;
  isSelf: boolean;
  /** Total admins in the roster — demote is only offered when another admin would remain. */
  adminCount: number;
}

// Subtle-but-distinct tint per role, both built from existing tokens rather
// than a new color: admin borrows the accent/ember family (the one role
// with elevated privileges), member stays neutral on border-strong/fg-muted
// - the same "quiet unless it matters" restraint the rest of the surface
// uses for anything non-destructive.
const ROLE_BADGE_STYLES: Record<OrgRole, string> = {
  admin: "border-accent/40 bg-accent-soft text-accent-strong",
  member: "border-border-strong bg-transparent text-fg-muted",
};

// One row per member - table-row sibling of the list version this
// replaces, same per-row mutation-instance convention as
// model-role-row.tsx. Role is now a read-only badge for every viewer (never
// a Select); the trailing ellipsis DropdownMenu is the only control, and it
// only renders at all when canManage - carrying forward every semantic the
// old inline Select + Remove button pair had (self-demote through
// ConfirmDialog, remove hidden for self, busy disables the trigger), just
// behind one WAI-ARIA menu-button instead of two exposed controls.
export function MemberRow({ member, canManage, isSelf, adminCount }: MemberRowProps) {
  const updateRole = useUpdateMemberRoleMutation();
  const removeMember = useRemoveMemberMutation();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [selfDemoteOpen, setSelfDemoteOpen] = useState(false);
  const busy = updateRole.isPending || removeMember.isPending;

  // Demoting yourself out of admin can take your own canManage rights away
  // mid-tab - the one role change routed through a confirm instead of
  // committing immediately, same exception the old Select's
  // handleRoleChange carried. Only reachable for self since canManage
  // implies you're currently admin.
  function handleRoleChange(role: OrgRole) {
    if (role === member.role) return;
    if (isSelf && member.role === "admin" && role === "member") {
      setSelfDemoteOpen(true);
      return;
    }
    updateRole.mutate({ memberId: member.id, role });
  }

  function handleConfirmSelfDemote() {
    updateRole.mutate({ memberId: member.id, role: "member" }, { onSuccess: () => setSelfDemoteOpen(false) });
  }

  const menuItems: DropdownMenuItem[] = [];
  if (canManage) {
    // Demoting the only admin would orphan the org (the server 409s it
    // anyway) — don't offer the action at all unless another admin remains.
    if (member.role === "admin") {
      if (adminCount > 1) {
        menuItems.push({ key: "demote", label: "Demote to member", onSelect: () => handleRoleChange("member") });
      }
    } else {
      menuItems.push({ key: "promote", label: "Promote to admin", onSelect: () => handleRoleChange("admin") });
    }
    if (!isSelf) {
      menuItems.push({
        key: "remove",
        label: "Remove from organization",
        destructive: true,
        onSelect: () => setRemoveOpen(true),
      });
    }
  }

  const hasError = updateRole.isError || removeMember.isError;

  return (
    <>
      <tr className="transition-swift border-t border-border first:border-t-0 hover:bg-elevated">
        <td className="py-5 pl-4 pr-4 align-middle">
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
        </td>

        <td className="py-5 pr-4 text-center align-middle">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.2em]",
              ROLE_BADGE_STYLES[member.role],
            )}
          >
            {roleLabel(member.role)}
          </span>
        </td>

        <td className="hidden py-5 pr-4 text-center align-middle font-mono text-xs text-fg-faint sm:table-cell">
          {formatJoinedDate(member.createdAt)}
        </td>

        {canManage ? (
          <td className="py-5 pl-4 pr-4 text-center align-middle">
            {menuItems.length > 0 ? (
              <DropdownMenu items={menuItems} triggerLabel={`Actions for ${member.name}`} disabled={busy} />
            ) : null}
          </td>
        ) : null}
      </tr>

      {hasError ? (
        <tr>
          <td colSpan={canManage ? 4 : 3} className="px-4 pb-4">
            <div className="flex flex-col gap-2">
              {updateRole.isError ? <FormNote>{updateRole.error.message}</FormNote> : null}
              {removeMember.isError ? <FormNote>{removeMember.error.message}</FormNote> : null}
            </div>
          </td>
        </tr>
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
        description="You'll lose admin access to this tab - someone else with admin will need to promote you back."
        confirmLabel="Change role"
        pendingLabel="Changing…"
      />
    </>
  );
}
