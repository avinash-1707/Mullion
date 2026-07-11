"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { redirectToApp } from "@/lib/return-to";
import {
  AuthMutationError,
  useSignInMutation,
  useSendSignInOtpMutation,
  useVerifySignInOtpMutation,
} from "@/hooks/use-auth-mutations";
import { useResendCooldown } from "@/hooks/use-resend-cooldown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { SocialButtons } from "./social-buttons";
import { AuthDivider } from "./auth-divider";
import { AuthAlert } from "./auth-alert";
import { OtpInput } from "./otp-input";

// Three steps live in one form so the email typed in step 1 carries
// straight through to steps 2/3 without re-typing: "password" is the
// default; "code-email" and "code-otp" are the "email me a code instead"
// path for social-first accounts that never set a password.
type Step = "password" | "code-email" | "code-otp";

export function SignInForm() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [otp, setOtp] = useState("");
  // /reset-password lands here with ?reset=1 after a successful password
  // reset (which revokes every existing session). useSyncExternalStore keeps
  // this hydration-safe (server snapshot false, client re-reads after
  // hydration) without a setState-in-effect or a Suspense boundary.
  const resetNotice = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("reset") === "1",
    () => false,
  );
  const resend = useResendCooldown();

  const signIn = useSignInMutation();
  const sendOtp = useSendSignInOtpMutation();
  const verifyOtp = useVerifySignInOtpMutation();

  // Already signed in (or just signed in): the product lives on the
  // dashboard app, so this is a full-page cross-origin hand-off honoring a
  // validated ?returnTo= deep link. redirectToApp latches internally, so
  // this effect and either mutation's onSuccess can't double-navigate.
  useEffect(() => {
    if (!isPending && session) redirectToApp();
  }, [isPending, session]);

  const emailNotVerified = signIn.error instanceof AuthMutationError && signIn.error.code === "EMAIL_NOT_VERIFIED";

  function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
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

  function handleSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendOtp.mutate(email, {
      onSuccess: () => {
        setStep("code-otp");
        resend.start();
      },
    });
  }

  function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    verifyOtp.mutate({ email, otp }, { onSuccess: () => redirectToApp() });
  }

  return (
    <div className="flex flex-col gap-5">
      {step === "password" && resetNotice ? (
        <AuthAlert tone="notice">Password updated. You&apos;ve been signed out everywhere — sign in with your new password.</AuthAlert>
      ) : null}

      {step === "password" ? <SocialButtons /> : null}
      {step === "password" ? <AuthDivider /> : null}

      {step === "password" ? (
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-5" noValidate>
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
                className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-faint transition-colors duration-200 hover:text-ember"
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
            className="mt-2 w-full bg-ember px-8 py-3.5 font-mono text-xs uppercase tracking-[0.2em] text-cream transition-[background-color,transform] duration-200 hover:bg-ember-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
          >
            {signIn.isPending ? "Signing in…" : "Sign in"}
          </button>

          <button
            type="button"
            onClick={() => setStep("code-email")}
            className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors duration-200 hover:text-ember"
          >
            Email me a code instead
          </button>
        </form>
      ) : null}

      {step === "code-email" ? (
        <form onSubmit={handleSendCode} className="flex flex-col gap-5" noValidate>
          <p className="text-sm text-ink-muted">
            We&apos;ll email a 6-digit code to sign in — no password needed. This only works for accounts that
            signed up with Google or GitHub and never set a password.
          </p>
          <div className="flex flex-col gap-2.5">
            <Label htmlFor="otp-email">Email</Label>
            <Input
              id="otp-email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          {sendOtp.error ? <AuthAlert>{sendOtp.error.message}</AuthAlert> : null}

          <button
            type="submit"
            disabled={sendOtp.isPending}
            className="w-full bg-ember px-8 py-3.5 font-mono text-xs uppercase tracking-[0.2em] text-cream transition-[background-color,transform] duration-200 hover:bg-ember-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
          >
            {sendOtp.isPending ? "Sending…" : "Send code"}
          </button>

          <button
            type="button"
            onClick={() => setStep("password")}
            className="text-center font-mono text-[11px] uppercase tracking-[0.2em] text-ink-faint transition-colors duration-200 hover:text-ember"
          >
            Sign in with a password instead
          </button>
        </form>
      ) : null}

      {step === "code-otp" ? (
        <form onSubmit={handleVerifyCode} className="flex flex-col gap-5" noValidate>
          <p className="text-sm text-ink-muted">
            Enter the 6-digit code sent to <span className="text-ink">{email}</span>. It expires in 5 minutes and
            allows 3 attempts.
          </p>

          <OtpInput id="sign-in-otp" value={otp} onChange={setOtp} autoFocus aria-invalid={!!verifyOtp.error} />

          {verifyOtp.error ? <AuthAlert>{verifyOtp.error.message}</AuthAlert> : null}

          <button
            type="submit"
            disabled={verifyOtp.isPending || otp.length < 6}
            className="w-full bg-ember px-8 py-3.5 font-mono text-xs uppercase tracking-[0.2em] text-cream transition-[background-color,transform] duration-200 hover:bg-ember-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
          >
            {verifyOtp.isPending ? "Verifying…" : "Verify and sign in"}
          </button>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setOtp("");
                setStep("code-email");
              }}
              className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-faint transition-colors duration-200 hover:text-ember"
            >
              Use a different email
            </button>
            <button
              type="button"
              disabled={!resend.canResend || sendOtp.isPending}
              onClick={() => sendOtp.mutate(email, { onSuccess: () => resend.start() })}
              className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-faint transition-colors duration-200 hover:text-ember disabled:pointer-events-none disabled:opacity-50"
            >
              {resend.canResend ? "Resend code" : `Resend in ${resend.remaining}s`}
            </button>
          </div>
        </form>
      ) : null}

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
    </div>
  );
}
