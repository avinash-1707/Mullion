"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useResetPasswordMutation, useRequestPasswordResetMutation } from "@/hooks/use-auth-mutations";
import { useResendCooldown } from "@/hooks/use-resend-cooldown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthAlert } from "./auth-alert";
import { OtpInput } from "./otp-input";

interface ResetPasswordFormProps {
  initialEmail: string;
}

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm({ initialEmail }: ResetPasswordFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const resend = useResendCooldown();
  const resetPassword = useResetPasswordMutation();
  const resendCode = useRequestPasswordResetMutation();

  const passwordsMatch = password === confirmPassword;
  const passwordLongEnough = password.length >= MIN_PASSWORD_LENGTH;
  const isValid = !!email && otp.length === 6 && passwordLongEnough && passwordsMatch;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!isValid || resetPassword.isPending) return;
    // Resetting the password revokes every existing session (server-side) —
    // /sign-in surfaces that as a one-time notice via ?reset=1.
    resetPassword.mutate({ email, otp, password }, { onSuccess: () => router.push("/sign-in?reset=1") });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <Label htmlFor="otp">Code</Label>
        <OtpInput
          id="otp"
          value={otp}
          onChange={setOtp}
          autoFocus={!!initialEmail}
          aria-invalid={!!resetPassword.error}
        />
        <p className="text-xs text-ink-faint">Expires in 5 minutes. You get 3 attempts.</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={touched && !passwordLongEnough}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          placeholder="Type it again"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          aria-invalid={touched && !passwordsMatch}
        />
      </div>

      {touched && !passwordsMatch ? <AuthAlert>Passwords don&apos;t match.</AuthAlert> : null}
      {touched && passwordsMatch && !passwordLongEnough ? (
        <AuthAlert>Password needs to be at least 8 characters.</AuthAlert>
      ) : null}
      {resetPassword.error ? <AuthAlert>{resetPassword.error.message}</AuthAlert> : null}
      {resendCode.isSuccess ? <AuthAlert tone="notice">New code sent. Check your inbox.</AuthAlert> : null}

      <button
        type="submit"
        disabled={resetPassword.isPending}
        className="mt-2 w-full rounded-md bg-ember px-8 py-3.5 font-mono text-xs uppercase tracking-[0.2em] text-cream outline-none transition-[background-color,transform] duration-200 hover:bg-ember-strong focus-visible:bg-ember-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
      >
        {resetPassword.isPending ? "Updating…" : "Update password"}
      </button>

      <button
        type="button"
        disabled={!resend.canResend || resendCode.isPending || !email}
        onClick={() => resendCode.mutate(email, { onSuccess: () => resend.start() })}
        className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint outline-none transition-colors duration-200 hover:text-ember focus-visible:text-ember disabled:pointer-events-none disabled:opacity-50"
      >
        {resendCode.isPending ? "Sending…" : resend.canResend ? "Resend code" : `Resend in ${resend.remaining}s`}
      </button>

      <p className="text-center text-sm text-ink-muted">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-medium text-ember outline-none transition-colors duration-200 hover:text-ember-strong focus-visible:text-ember-strong">
          Sign in
        </Link>
      </p>
    </form>
  );
}
