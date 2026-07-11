"use client";

import { useState, type FormEvent } from "react";
import {
  useListAccountsQuery,
  useSetPasswordMutation,
  useChangePasswordMutation,
} from "@/hooks/use-account-mutations";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FormNote } from "./form-note";

const MIN_PASSWORD_LENGTH = 8;

export function SecuritySection() {
  const accounts = useListAccountsQuery();
  const hasPassword = accounts.data?.some((account) => account.providerId === "credential") ?? null;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-serif text-2xl leading-snug tracking-tight text-fg">Password</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {hasPassword === false
            ? "Your account currently signs in with Google or GitHub only."
            : "Change the password you use to sign in."}
        </p>
      </div>

      {accounts.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : hasPassword ? (
        <ChangePasswordForm />
      ) : (
        <SetPasswordForm />
      )}
    </section>
  );
}

function SetPasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const setPassword = useSetPasswordMutation();

  const passwordsMatch = newPassword === confirmPassword;
  const longEnough = newPassword.length >= MIN_PASSWORD_LENGTH;
  const isValid = passwordsMatch && longEnough;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!isValid || setPassword.isPending) return;
    setPassword.mutate(newPassword, {
      onSuccess: () => {
        setNewPassword("");
        setConfirmPassword("");
        setTouched(false);
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <TextField
        fieldId="new-password"
        label="New password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        aria-invalid={touched && !longEnough}
      />
      <TextField
        fieldId="confirm-password"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        placeholder="Type it again"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        aria-invalid={touched && !passwordsMatch}
      />

      {touched && !longEnough ? <FormNote>Password needs to be at least 8 characters.</FormNote> : null}
      {touched && longEnough && !passwordsMatch ? <FormNote>Passwords don&apos;t match.</FormNote> : null}
      {setPassword.error ? <FormNote>{setPassword.error.message}</FormNote> : null}
      {setPassword.isSuccess ? <FormNote tone="success">Password set.</FormNote> : null}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={setPassword.isPending}>
          {setPassword.isPending ? "Setting…" : "Set password"}
        </Button>
      </div>
    </form>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const changePassword = useChangePasswordMutation();

  const passwordsMatch = newPassword === confirmPassword;
  const longEnough = newPassword.length >= MIN_PASSWORD_LENGTH;
  const isValid = passwordsMatch && longEnough && currentPassword.length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!isValid || changePassword.isPending) return;
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          setTouched(false);
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <TextField
        fieldId="current-password"
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
      />
      <TextField
        fieldId="new-password"
        label="New password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        aria-invalid={touched && !longEnough}
      />
      <TextField
        fieldId="confirm-password"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        placeholder="Type it again"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        aria-invalid={touched && !passwordsMatch}
      />

      {touched && !longEnough ? <FormNote>Password needs to be at least 8 characters.</FormNote> : null}
      {touched && longEnough && !passwordsMatch ? <FormNote>Passwords don&apos;t match.</FormNote> : null}
      {changePassword.error ? <FormNote>{changePassword.error.message}</FormNote> : null}
      {changePassword.isSuccess ? (
        <FormNote tone="success">Password changed. Other sessions were signed out.</FormNote>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={changePassword.isPending}>
          {changePassword.isPending ? "Changing…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
