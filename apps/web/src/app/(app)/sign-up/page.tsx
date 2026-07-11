"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignUpMutation } from "@/hooks/use-auth-mutations";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";

export default function SignUpPage() {
  const router = useRouter();
  const signUp = useSignUpMutation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    signUp.mutate(
      { name, email, password },
      { onSuccess: () => router.push("/dashboard") },
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <h1 className="text-xl font-semibold tracking-tight text-fg">Create your account</h1>
        <p className="mt-1.5 text-sm text-fg-muted">Start planning your first build.</p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5" noValidate>
          <TextField
            label="Name"
            fieldId="name"
            type="text"
            name="name"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {signUp.error ? (
            <p
              role="alert"
              className="rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger"
            >
              {signUp.error.message}
            </p>
          ) : null}

          <Button type="submit" disabled={signUp.isPending} className="mt-2 w-full">
            {signUp.isPending ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-fg-muted">
          Already have an account?{" "}
          <Link href="/sign-in" className="transition-swift font-medium text-accent hover:text-accent-strong">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
