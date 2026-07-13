"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useOrgMembersQuery, useLeaveOrgMutation } from "@/hooks/use-org-members";
import { useActiveOrganization } from "@/hooks/use-organizations";
import { isPersonalOrg, type OrgInvitation } from "@/lib/organizations-api";
import { FormNote } from "./form-note";
import { OrgRenameField } from "./org-rename-field";
import { MemberRow } from "./member-row";
import { InviteMemberForm } from "./invite-member-form";
import { PendingInviteRow } from "./pending-invite-row";

// Tab content composing org identity (rename) + roster + invite panel —
// same composing role ModelsSection plays for ByokKeyCard + the role list:
// this one component owns the three internal border-t dividers, TabPanel
// in settings-tabs.tsx just wraps it in the usual "pt-14".
export function MembersSection() {
  const { data: session } = authClient.useSession();
  const membersQuery = useOrgMembersQuery();
  const activeOrg = useActiveOrganization();
  const leaveOrg = useLeaveOrgMutation();
  const [leaveOpen, setLeaveOpen] = useState(false);

  const data = membersQuery.data;
  const currentUserId = session?.user.id;
  const adminCount = data?.members.filter((member) => member.role === "admin").length ?? 0;
  // Defaults to hidden while the org list is still resolving (activeOrg
  // null) — showing a "leave" action prematurely on what might turn out to
  // be a personal org is worse than a brief delay before it appears.
  const canLeave = activeOrg !== null && !isPersonalOrg(activeOrg.metadata);

  function handleConfirmLeave() {
    leaveOrg.mutate(undefined, {
      onSuccess: () => {
        // Full navigation, not router.push: the active org just changed
        // server-side (session row) via a custom route Better Auth's own
        // client never saw — its session/org hooks (a separate store from
        // TanStack Query) need a hard reload to pick that up, same
        // reasoning AccountMenu's sign-out uses a full navigation.
        window.location.assign("/");
      },
    });
  }

  return (
    <section className="flex flex-col gap-14">
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="font-serif text-2xl leading-snug tracking-tight text-fg">Organization</h2>
          <p className="mt-1 text-sm text-fg-muted">The name your team sees across Mullion.</p>
        </div>
        <OrgRenameField canManage={data?.canManage ?? false} />
      </div>

      <div className="flex flex-col gap-6 border-t border-hairline pt-14">
        <div>
          <h2 className="font-serif text-2xl leading-snug tracking-tight text-fg">Members</h2>
          <p className="mt-1 text-sm text-fg-muted">Everyone with access to this organization.</p>
        </div>

        {membersQuery.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : data ? (
          <table className="w-full table-fixed border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th
                  scope="col"
                  className="py-3 pl-4 pr-4 align-middle font-mono text-[11px] font-normal uppercase tracking-[0.2em] text-fg-muted"
                >
                  Member
                </th>
                <th
                  scope="col"
                  className="w-32 py-3 pr-4 text-center align-middle font-mono text-[11px] font-normal uppercase tracking-[0.2em] text-fg-muted"
                >
                  Role
                </th>
                {/* Collapsed below sm rather than wrapped in an overflow-x-auto
                    container — Member/Role/Actions alone already fit any
                    reasonable viewport width, so there's nothing to scroll. */}
                <th
                  scope="col"
                  className="hidden w-36 py-3 pr-4 text-center align-middle font-mono text-[11px] font-normal uppercase tracking-[0.2em] text-fg-muted sm:table-cell"
                >
                  Joined
                </th>
                {data.canManage ? (
                  <th scope="col" className="w-14 py-3 pl-4 pr-4 text-center align-middle">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {data.members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  canManage={data.canManage}
                  isSelf={member.userId === currentUserId}
                  adminCount={adminCount}
                />
              ))}
            </tbody>
          </table>
        ) : membersQuery.error ? (
          <FormNote>{membersQuery.error.message}</FormNote>
        ) : null}

        {canLeave ? (
          <div className="flex flex-col gap-2 border-t border-hairline pt-6">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => setLeaveOpen(true)}
            >
              Leave organization
            </Button>
            {leaveOrg.error ? <FormNote>{leaveOrg.error.message}</FormNote> : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-6 border-t border-hairline pt-14">
        <div>
          <h2 className="font-serif text-2xl leading-snug tracking-tight text-fg">Invitations</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Invite teammates by email - they&rsquo;ll join with the role you pick.
          </p>
        </div>

        {data?.canManage ? <InviteMemberForm /> : null}

        {membersQuery.isPending ? (
          <Skeleton className="h-14 w-full" />
        ) : data ? (
          <PendingInvitesList invitations={data.invitations} canManage={data.canManage} />
        ) : null}
      </div>

      <ConfirmDialog
        open={leaveOpen}
        pending={leaveOrg.isPending}
        onCancel={() => setLeaveOpen(false)}
        onConfirm={handleConfirmLeave}
        title="Leave this organization?"
        description="You'll lose access to everything in it. Someone will need to invite you back to rejoin."
        confirmLabel="Leave organization"
        pendingLabel="Leaving…"
      />
    </section>
  );
}

// "canceled"/"accepted" invitations are excluded here — filtering by
// status==="pending" already yields exactly "pending + expired" (expired
// is never a stored status, see pendingInviteDisplayStatus), which is what
// the contract calls for.
function PendingInvitesList({ invitations, canManage }: { invitations: OrgInvitation[]; canManage: boolean }) {
  const visible = invitations.filter((invitation) => invitation.status === "pending");

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border border-hairline px-5 py-10 text-center">
        <p className="font-serif text-xl text-fg">No pending invitations.</p>
        <p className="mt-2 text-sm text-fg-muted">
          {canManage ? "Invite a teammate above to get started." : "Nobody's been invited yet."}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {visible.map((invitation) => (
        <PendingInviteRow key={invitation.id} invitation={invitation} canManage={canManage} />
      ))}
    </ul>
  );
}
