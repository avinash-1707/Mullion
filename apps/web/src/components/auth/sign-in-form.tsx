"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { redirectToApp } from "@/lib/return-to";
import { AuthMutationError, useSignInMutation } from "@/hooks/use-auth-mutations";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { SocialButtons } from "./social-buttons";
import { AuthDivider } from "./auth-divider";
import { AuthAlert } from "./auth-alert";

// Password is the only visible email sign-in method (ADR-68) — social-first
// accounts recover through /forgot-password, which provisions their first
// password via the stock reset flow.
export function SignInForm() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  // /reset-password lands here with ?reset=1 after a successful password
  // reset (which revokes every existing session). useSyncExternalStore keeps
  // this hydration-safe (server snapshot false, client re-reads after
  // hydration) without a setState-in-effect or a Suspense boundary.
  const resetNotice = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("reset") === "1",
    () => false,
  );

  const signIn = useSignInMutation();

  // Already signed in (or just signed in): the product lives on the
  // dashboard app, so this is a full-page cross-origin hand-off honoring a
  // validated ?returnTo= deep link. redirectToApp latches internally, so
  // this effect and the mutation's onSuccess can't double-navigate.
  useEffect(() => {
    if (!isPending && session) redirectToApp();
  }, [isPending, session]);

  const emailNotVerified = signIn.error instanceof AuthMutationError && signIn.error.code === "EMAIL_NOT_VERIFIED";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    signIn.mutate(
      { email, password, rememberMe },
      {
        onSuccess: () => redirectToApp(),
        onError: (error) => {
          if (error instanceof AuthMutationError && error.code === "EMAIL_NOT_VERIFIED") {
            router.push(`/verify-email?email=${encodeURIComponent(email)}`);
          }
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {resetNotice ? (
        <AuthAlert tone="notice">Password updated. You&apos;ve been signed out everywhere. Sign in with your new password.</AuthAlert>
      ) : null}

      <SocialButtons />
      <AuthDivider />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
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
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-faint outline-none transition-colors duration-200 hover:text-ember focus-visible:text-ember"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Your password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <div className="flex items-center gap-3">
          <Checkbox
            id="remember-me"
            checked={rememberMe}
            onCheckedChange={(checked) => setRememberMe(checked === true)}
          />
          <Label htmlFor="remember-me" className="cursor-pointer">
            Remember me
          </Label>
        </div>

        {signIn.error && !emailNotVerified ? <AuthAlert>{signIn.error.message}</AuthAlert> : null}

        <button
          type="submit"
          disabled={signIn.isPending}
          className="mt-2 w-full rounded-md bg-ember px-8 py-3.5 font-mono text-xs uppercase tracking-[0.2em] text-cream outline-none transition-[background-color,transform] duration-200 hover:bg-ember-strong focus-visible:bg-ember-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
        >
          {signIn.isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <Separator className="mt-2" />

      <p className="text-center text-sm text-ink-muted">
        New to Mullion?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-ember outline-none transition-colors duration-200 hover:text-ember-strong focus-visible:text-ember-strong"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
