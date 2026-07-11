"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { redirectToApp } from "@/lib/return-to";
import { useSignUpMutation } from "@/hooks/use-auth-mutations";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SocialButtons } from "./social-buttons";
import { AuthDivider } from "./auth-divider";
import { AuthAlert } from "./auth-alert";

export function SignUpForm() {
  const router = useRouter();
  const signUp = useSignUpMutation();
  const { data: session, isPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Already signed in (or just signed up): hand off to the dashboard app —
  // full-page cross-origin navigation with a validated ?returnTo=.
  // redirectToApp latches internally against double-navigation. This never
  // fires from this component's own sign-up, though: with
  // requireEmailVerification on, signUp.email doesn't establish a session
  // until the code is verified, so there's no session to race against the
  // /verify-email redirect below.
  useEffect(() => {
    if (!isPending && session) redirectToApp();
  }, [isPending, session]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // The server sends the verification OTP as part of sign-up
    // (sendOnSignUp: true) — nothing to trigger here, just hand off.
    signUp.mutate(
      { name, email, password },
      { onSuccess: () => router.push(`/verify-email?email=${encodeURIComponent(email)}`) },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SocialButtons />
      <AuthDivider />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-2.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            type="text"
            name="name"
            autoComplete="name"
            placeholder="Your name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {signUp.error ? <AuthAlert>{signUp.error.message}</AuthAlert> : null}

        <button
          type="submit"
          disabled={signUp.isPending}
          className="mt-2 w-full bg-ember px-8 py-3.5 font-mono text-xs uppercase tracking-[0.2em] text-cream transition-[background-color,transform] duration-200 hover:bg-ember-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
        >
          {signUp.isPending ? "Creating your account…" : "Start building"}
        </button>

        <Separator className="mt-2" />

        <p className="text-center text-sm text-ink-muted">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-ember transition-colors duration-200 hover:text-ember-strong"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
