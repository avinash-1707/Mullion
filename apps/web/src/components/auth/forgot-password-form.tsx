"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRequestPasswordResetMutation } from "@/hooks/use-auth-mutations";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthAlert } from "./auth-alert";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const request = useRequestPasswordResetMutation();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    request.mutate(email, { onSuccess: () => setSent(true) });
  }

  // Enumeration-safe: the server always returns success, so this state
  // renders unconditionally on a resolved request — never "no account
  // found" branching.
  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <AuthAlert tone="notice">
          If an account exists for <span className="text-ink">{email}</span>, we&apos;ve sent a 6-digit code. It
          expires in 5 minutes.
        </AuthAlert>
        <Link
          href={`/reset-password?email=${encodeURIComponent(email)}`}
          className="w-full bg-ember px-8 py-4 text-center font-mono text-xs uppercase tracking-[0.2em] text-cream transition-[background-color,transform] duration-200 hover:bg-ember-strong active:scale-[0.97]"
        >
          Enter the code
        </Link>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors duration-200 hover:text-ember"
        >
          Try a different email
        </button>
      </div>
    );
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

      {request.error ? <AuthAlert>{request.error.message}</AuthAlert> : null}

      <button
        type="submit"
        disabled={request.isPending || !email}
        className="w-full bg-ember px-8 py-3.5 font-mono text-xs uppercase tracking-[0.2em] text-cream transition-[background-color,transform] duration-200 hover:bg-ember-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
      >
        {request.isPending ? "Sending…" : "Send reset code"}
      </button>

      <p className="text-center text-sm text-ink-muted">
        Remembered it?{" "}
        <Link href="/sign-in" className="font-medium text-ember transition-colors duration-200 hover:text-ember-strong">
          Sign in
        </Link>
      </p>
    </form>
  );
}
