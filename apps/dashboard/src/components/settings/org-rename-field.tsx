"use client";

import { useState, type FormEvent } from "react";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { useActiveOrganization, useActiveOrganizationId, useRenameOrgMutation } from "@/hooks/use-organizations";
import { FormNote } from "./form-note";

interface OrgRenameFieldProps {
  canManage: boolean;
}

// Admin-only edit, read-only render otherwise — same shape as
// ByokKeyCard's !canManage branch. Not a masked value like the API key, so
// this doesn't need ByokKeyCard's separate editing-toggle state; it's a
// plain inline-save form like ProfileSection's name field.
export function OrgRenameField({ canManage }: OrgRenameFieldProps) {
  const activeOrg = useActiveOrganization();
  const organizationId = useActiveOrganizationId();
  const [name, setName] = useState(activeOrg?.name ?? "");
  const [prevOrgId, setPrevOrgId] = useState(organizationId);
  const rename = useRenameOrgMutation();

  // Render-phase resync (not an effect — same pattern as ByokKeyCard's
  // prevSync/MobileNav's prevPathname) so switching orgs snaps this field to
  // the newly-active org's real name instead of carrying over stale text.
  if (prevOrgId !== organizationId) {
    setPrevOrgId(organizationId);
    setName(activeOrg?.name ?? "");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !organizationId || rename.isPending) return;
    rename.mutate({ organizationId, name: trimmed });
  }

  if (!canManage) {
    return <p className="text-sm text-fg">{activeOrg?.name ?? "—"}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:max-w-sm">
      <TextField
        fieldId="org-name"
        label="Organization name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      {rename.error ? <FormNote>{rename.error.message}</FormNote> : null}
      {rename.isSuccess ? <FormNote tone="success">Saved.</FormNote> : null}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={rename.isPending || !name.trim()}>
          {rename.isPending ? "Saving…" : "Save name"}
        </Button>
      </div>
    </form>
  );
}
