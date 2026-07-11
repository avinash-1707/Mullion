"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { redirectToApp } from "@/lib/return-to";
import { useSignInMutation } from "@/hooks/use-auth-mutations";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

export function SignInForm() {
  const signIn = useSignInMutation();
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);

  // Already signed in (or just signed in): the product lives on the
  // dashboard app, so this is a full-page cross-origin hand-off honoring a
  // validated ?returnTo= deep link. redirectToApp latches internally, so
  // this effect and the mutation's onSuccess can't double-navigate.
  useEffect(() => {
    if (!isPending && session) redirectToApp();
  }, [isPending, session]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    signIn.mutate({ email, password, rememberMe }, { onSuccess: () => redirectToApp() });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
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

      {signIn.error ? (
        <p role="alert" className="border-l-2 border-ember bg-ember/10 px-4 py-3 text-sm text-ember">
          {signIn.error.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={signIn.isPending}
        className="mt-2 w-full bg-ember px-8 py-4 font-mono text-xs uppercase tracking-[0.2em] text-cream transition-[background-color,transform] duration-200 hover:bg-ember-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
      >
        {signIn.isPending ? "Signing in…" : "Sign in"}
      </button>

      <Separator className="mt-2" />

      <p className="text-center text-sm text-ink-muted">
        New to Mullion?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-ember transition-colors duration-200 hover:text-ember-strong"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
