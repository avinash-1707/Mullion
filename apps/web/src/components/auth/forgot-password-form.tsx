"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRequestPasswordResetMutation } from "@/hooks/use-auth-mutations";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthAlert } from "./auth-alert";

export function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const request = useRequestPasswordResetMutation();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enumeration-safe: the server always returns success, so this navigates
    // unconditionally on a resolved request — never "no account found"
    // branching. The code-entry screen carries the "if an account exists"
    // framing.
    request.mutate(email, {
      onSuccess: () => router.push(`/reset-password?email=${encodeURIComponent(email)}`),
    });
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
        className="w-full rounded-md bg-ember px-8 py-3.5 font-mono text-xs uppercase tracking-[0.2em] text-cream outline-none transition-[background-color,transform] duration-200 hover:bg-ember-strong focus-visible:bg-ember-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
      >
        {request.isPending ? "Sending…" : "Send code"}
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
