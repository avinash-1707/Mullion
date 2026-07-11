// Sign-in hand-off to the dashboard app (ADR-64). The dashboard sends
// unauthenticated visitors here with a ?returnTo=<deep link>; after auth we
// send them back. returnTo is attacker-influencable input driving a
// navigation, so it is validated to the dashboard origin — never assigned
// raw (open-redirect guard).

/**
 * Resolve a raw returnTo value against the dashboard base URL. Path-only
 * values ("/builds/abc") resolve onto the dashboard; absolute URLs must
 * match the dashboard origin exactly. Anything else — foreign origins,
 * protocol-relative "//evil.com", javascript: URLs, malformed input —
 * falls back to the dashboard root.
 */
export function resolveReturnTo(raw: string | null, base: string): string {
  try {
    const baseOrigin = new URL(base).origin;
    if (!raw) return base;
    const candidate = new URL(raw, base);
    return candidate.origin === baseOrigin ? candidate.href : base;
  } catch {
    return base;
  }
}

// Latched so a mutation onSuccess and the session-effect below can both call
// it (React strict-mode double-fires included) without queueing a second
// navigation. Set only immediately before the assign, so a failed attempt
// (missing env) doesn't strand later calls.
let redirecting = false;

// bfcache: Back after the hand-off can restore this document with the latch
// still set and no effect re-run — the sign-in button would then silently
// do nothing. Reload once so the page re-evaluates its session from
// scratch. (window guard: client components also evaluate during SSR.)
if (typeof window !== "undefined") {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && redirecting) {
      redirecting = false;
      window.location.reload();
    }
  });
}

/**
 * Full-page navigation to the dashboard app, honoring a validated
 * ?returnTo= from the current URL. Used on sign-in/sign-up success and to
 * forward an already-authenticated visitor off the auth pages.
 */
export function redirectToApp(): void {
  if (redirecting) return;
  const base = process.env.NEXT_PUBLIC_DASHBOARD_URL;
  if (!base) {
    throw new Error("NEXT_PUBLIC_DASHBOARD_URL is not set");
  }
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  const target = resolveReturnTo(raw, base);
  redirecting = true;
  window.location.assign(target);
}
