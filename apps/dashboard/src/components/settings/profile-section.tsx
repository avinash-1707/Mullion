"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { useUpdateProfileMutation } from "@/hooks/use-account-mutations";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { AvatarUpload } from "./avatar-upload";
import { FormNote } from "./form-note";

type Mode = "view" | "edit";

const EDIT_BUTTON_ID = "profile-edit-button";

// View/edit toggle rather than an always-editable form: name changes are
// rare, so the default state reads as identity (name + email + avatar), and
// "Edit profile" is an explicit, reversible action. The avatar itself sits
// outside this toggle entirely — AvatarUpload renders identically in both
// modes and uploads/removes immediately, independent of whether the name
// edit is in flight or gets cancelled.
export function ProfileSection() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [mode, setMode] = useState<Mode>("view");
  const [name, setName] = useState(user?.name ?? "");
  const updateProfile = useUpdateProfileMutation();
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
    setName(user?.name ?? "");
    updateProfile.reset();
    setMode("edit");
  }

  function handleCancel() {
    setName(user?.name ?? "");
    updateProfile.reset();
    focusEditButtonRef.current = true;
    setMode("view");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    // An emptied name would render a blank identity line in view mode.
    if (!trimmed || updateProfile.isPending) return;
    updateProfile.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          // Same focus discipline as Cancel — Save unmounts with the form.
          focusEditButtonRef.current = true;
          setMode("view");
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl leading-snug tracking-tight text-fg">Profile</h2>
        <p className="mt-1 text-sm text-fg-muted">Your name and avatar, as the rest of your team sees them.</p>
      </div>

      {mode === "view" ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <AvatarUpload name={user?.name ?? ""} email={user?.email ?? ""} image={user?.image} />

          <div className="min-w-0 flex-1">
            <p className="truncate text-base text-fg">{user?.name}</p>
            <p className="truncate font-mono text-xs text-fg-muted">{user?.email}</p>
          </div>

          <Button id={EDIT_BUTTON_ID} type="button" variant="secondary" size="sm" onClick={handleEdit}>
            Edit profile
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <AvatarUpload name={user?.name ?? ""} email={user?.email ?? ""} image={user?.image} />

            <div className="flex flex-1 flex-col gap-3">
              <TextField
                fieldId="name"
                label="Name"
                placeholder="Your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={updateProfile.isPending}
                autoFocus
              />
              <p className="font-mono text-xs text-fg-muted">{user?.email}</p>
            </div>
          </div>

          {updateProfile.error ? <FormNote>{updateProfile.error.message}</FormNote> : null}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={updateProfile.isPending}
              onClick={handleCancel}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={updateProfile.isPending}>
              {updateProfile.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
