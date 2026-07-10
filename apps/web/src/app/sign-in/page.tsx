"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignInMutation } from "../../hooks/use-auth-mutations";
import { TextField } from "../../components/ui/text-field";
import { Button } from "../../components/ui/button";

export default function SignInPage() {
  const router = useRouter();
  const signIn = useSignInMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    signIn.mutate(
      { email, password },
      { onSuccess: () => router.push("/dashboard") },
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <h1 className="text-xl font-semibold tracking-tight text-fg">Sign in</h1>
        <p className="mt-1.5 text-sm text-fg-muted">Pick up where you left off.</p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5" noValidate>
          <TextField
            label="Email"
            fieldId="email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <TextField
            label="Password"
            fieldId="password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {signIn.error ? (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
            >
              {signIn.error.message}
            </p>
          ) : null}

          <Button type="submit" disabled={signIn.isPending} className="mt-2 w-full">
            {signIn.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-fg-muted">
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="transition-swift font-medium text-accent hover:text-accent-strong">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
