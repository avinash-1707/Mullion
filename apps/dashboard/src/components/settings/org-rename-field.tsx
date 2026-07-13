"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { useActiveOrganization, useActiveOrganizationId, useRenameOrgMutation } from "@/hooks/use-organizations";
import { FormNote } from "./form-note";

interface OrgRenameFieldProps {
  canManage: boolean;
}

type Mode = "view" | "edit";

const EDIT_BUTTON_ID = "org-name-edit-button";

// View/edit toggle, same shape as ProfileSection's name field — and this
// shape is what actually fixes the hard-refresh bug the old always-editable
// form had: view mode renders `activeOrg?.name` live, never a local copy,
// so there's nothing to resync and nothing that can go stale. The old
// version seeded local state once and resynced only when `organizationId`
// changed; on a hard refresh the session (which supplies organizationId)
// resolves before useListOrganizations does, so the resync fired while
// activeOrg was still null and the field stayed blank forever. Edit mode
// still needs its own local copy to type into — that one seeds from the
// live name at the moment Edit is pressed, by which point activeOrg has
// necessarily already loaded (its name is what's on screen to click next to).
export function OrgRenameField({ canManage }: OrgRenameFieldProps) {
  const activeOrg = useActiveOrganization();
  const organizationId = useActiveOrganizationId();
  const [mode, setMode] = useState<Mode>("view");
  const [name, setName] = useState("");
  const rename = useRenameOrgMutation();
  const focusEditButtonRef = useRef(false);

  // Only fires for Cancel/Save-triggered transitions — the edit button
  // doesn't exist in the DOM until after this render commits, so the focus
  // call has to happen in an effect, not inline in the handler.
  useEffect(() => {
    if (mode === "view" && focusEditButtonRef.current) {
      focusEditButtonRef.current = false;
      document.getElementById(EDIT_BUTTON_ID)?.focus();
    }
  }, [mode]);

  function handleEdit() {
    setName(activeOrg?.name ?? "");
    rename.reset();
    setMode("edit");
  }

  function handleCancel() {
    setName(activeOrg?.name ?? "");
    rename.reset();
    focusEditButtonRef.current = true;
    setMode("view");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    // An emptied name would render a blank identity line in view mode.
    if (!trimmed || !organizationId || rename.isPending) return;
    rename.mutate(
      { organizationId, name: trimmed },
      {
        onSuccess: () => {
          // Same focus discipline as Cancel — Save unmounts with the form.
          focusEditButtonRef.current = true;
          setMode("view");
        },
      },
    );
  }

  if (!canManage) {
    return <p className="text-sm text-fg">{activeOrg?.name ?? "—"}</p>;
  }

  if (mode === "view") {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className="min-w-0 truncate text-sm text-fg">{activeOrg?.name ?? "—"}</p>
        <Button id={EDIT_BUTTON_ID} type="button" variant="secondary" size="sm" onClick={handleEdit}>
          Edit
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:max-w-sm">
      <TextField
        fieldId="org-name"
        label="Organization name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={rename.isPending}
        autoFocus
      />
      {rename.error ? <FormNote>{rename.error.message}</FormNote> : null}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" size="sm" disabled={rename.isPending} onClick={handleCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={rename.isPending || !name.trim()}>
          {rename.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
