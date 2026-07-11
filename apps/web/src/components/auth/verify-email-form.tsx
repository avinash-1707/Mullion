"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { redirectToApp } from "@/lib/return-to";
import { useVerifyEmailOtpMutation, useSendEmailVerificationOtpMutation } from "@/hooks/use-auth-mutations";
import { useResendCooldown } from "@/hooks/use-resend-cooldown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthAlert } from "./auth-alert";
import { OtpInput } from "./otp-input";

interface VerifyEmailFormProps {
  initialEmail: string;
}

// No "send" step here — the server already sent the first code, either at
// sign-up (sendOnSignUp: true) or on a blocked unverified sign-in attempt.
// This form only ever verifies or resends.
export function VerifyEmailForm({ initialEmail }: VerifyEmailFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const resend = useResendCooldown();
  const verify = useVerifyEmailOtpMutation();
  const resendOtp = useSendEmailVerificationOtpMutation();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // autoSignInAfterVerification means success here also leaves us with a
    // session — same hand-off as a normal sign-in.
    verify.mutate({ email, otp }, { onSuccess: () => redirectToApp() });
  }

  function handleResend() {
    resendOtp.mutate(email, { onSuccess: () => resend.start() });
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
        <Label htmlFor="otp">Verification code</Label>
        <OtpInput id="otp" value={otp} onChange={setOtp} autoFocus={!!initialEmail} aria-invalid={!!verify.error} />
        <p className="text-xs text-ink-faint">Expires in 5 minutes. You get 3 attempts.</p>
      </div>

      {verify.error ? <AuthAlert>{verify.error.message}</AuthAlert> : null}
      {resendOtp.isSuccess ? <AuthAlert tone="notice">New code sent. Check your inbox.</AuthAlert> : null}
      {resendOtp.error ? <AuthAlert>{resendOtp.error.message}</AuthAlert> : null}

      <button
        type="submit"
        disabled={verify.isPending || otp.length < 6 || !email}
        className="mt-2 w-full bg-ember px-8 py-3.5 font-mono text-xs uppercase tracking-[0.2em] text-cream transition-[background-color,transform] duration-200 hover:bg-ember-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
      >
        {verify.isPending ? "Verifying…" : "Verify email"}
      </button>

      <button
        type="button"
        disabled={!resend.canResend || resendOtp.isPending || !email}
        onClick={handleResend}
        className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors duration-200 hover:text-ember disabled:pointer-events-none disabled:opacity-50"
      >
        {resendOtp.isPending ? "Sending…" : resend.canResend ? "Resend code" : `Resend in ${resend.remaining}s`}
      </button>

      <p className="text-center text-sm text-ink-muted">
        Wrong account?{" "}
        <Link href="/sign-in" className="font-medium text-ember transition-colors duration-200 hover:text-ember-strong">
          Sign in again
        </Link>
      </p>
    </form>
  );
}
