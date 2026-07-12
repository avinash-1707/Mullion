"use client";

import { useState, type FormEvent } from "react";
import { TextField } from "@/components/ui/text-field";
import { Select, type SelectOption } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useInviteMemberMutation } from "@/hooks/use-org-members";
import type { OrgRole } from "@/lib/organizations-api";
import { FormNote } from "./form-note";

const ROLE_OPTIONS: SelectOption[] = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

// Same shape as ByokKeyCard's form: single-purpose fields + a submit button
// + an inline FormNote for whatever the server rejects (duplicate/invalid
// email, already a member, etc.) — no client-side dedupe guard, since
// re-inviting the same pending email is a valid resend, not an error.
export function InviteMemberForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const invite = useInviteMemberMutation();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || invite.isPending) return;
    invite.mutate({ email: trimmed, role }, { onSuccess: () => setEmail("") });
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <TextField
            fieldId="invite-email"
            label="Email"
            type="email"
            placeholder="teammate@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="sm:w-40">
          <Select
            fieldId="invite-role"
            label="Role"
            value={role}
            onChange={(value) => setRole(value as OrgRole)}
            options={ROLE_OPTIONS}
          />
        </div>
        <Button type="submit" size="sm" disabled={!email.trim() || invite.isPending}>
          {invite.isPending ? "Sending…" : "Send invite"}
        </Button>
      </form>
      {invite.error ? <FormNote>{invite.error.message}</FormNote> : null}
    </div>
  );
}
