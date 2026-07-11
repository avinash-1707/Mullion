"use client";

import { appCallbackURL } from "@/lib/return-to";
import { useSignInSocialMutation, useSignInOAuth2Mutation } from "@/hooks/use-auth-mutations";
import { AuthAlert } from "./auth-alert";

const BUTTON_CLASS =
  "flex h-11 w-full items-center justify-center gap-3 border border-hairline-light bg-transparent font-mono text-xs uppercase tracking-[0.2em] text-ink transition-colors duration-200 hover:border-ember hover:text-ember-strong focus-visible:border-ember disabled:pointer-events-none disabled:opacity-50";

// Official full-color brand marks: Google's four-color G and GitHub's
// near-black octocat (#181717) — these buttons only render on the light
// auth surface, so the fixed colors are safe.
function GoogleGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M21.6 12.23c0-.76-.07-1.49-.2-2.19H12v4.14h5.4a4.62 4.62 0 0 1-2 3.03v2.5h3.24c1.9-1.75 3-4.32 3-7.48Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.97-.9 6.63-2.44l-3.24-2.5c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.58A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.41 13.9a5.99 5.99 0 0 1 0-3.8V7.52H3.06a10 10 0 0 0 0 8.96l3.35-2.58Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87C16.96 2.99 14.7 2 12 2a10 10 0 0 0-8.94 5.52l3.35 2.58c.79-2.36 2.98-4.12 5.59-4.12Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GithubGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="#181717" className={className} aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.48 2 2 6.58 2 12.21c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.61-3.37-1.21-3.37-1.21-.46-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.05a9.42 9.42 0 0 1 5 0c1.91-1.32 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.21C22 6.58 17.52 2 12 2Z"
      />
    </svg>
  );
}

// Shared by the sign-in and sign-up forms. Same destination either way —
// both establish a session and hand off to the dashboard app, honoring a
// validated ?returnTo=.
export function SocialButtons() {
  const google = useSignInSocialMutation();
  const github = useSignInOAuth2Mutation();
  const isPending = google.isPending || github.isPending;
  const error = google.error ?? github.error;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={isPending}
        onClick={() => google.mutate({ provider: "google", callbackURL: appCallbackURL() })}
        className={BUTTON_CLASS}
      >
        <GoogleGlyph className="h-[18px] w-[18px]" />
        {google.isPending ? "Redirecting…" : "Continue with Google"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => github.mutate({ providerId: "github-login", callbackURL: appCallbackURL() })}
        className={BUTTON_CLASS}
      >
        <GithubGlyph className="h-[18px] w-[18px]" />
        {github.isPending ? "Redirecting…" : "Continue with GitHub"}
      </button>
      {error ? <AuthAlert>{error.message}</AuthAlert> : null}
    </div>
  );
}
