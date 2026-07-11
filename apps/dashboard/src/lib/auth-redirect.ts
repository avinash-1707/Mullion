// Cross-app auth redirects. The dashboard has no /sign-in of its own — the
// auth pages live on the marketing app (apps/web), so an unauthenticated
// visitor leaves this origin entirely. Both helpers are full-page
// navigations (router.push cannot cross origins) and latch so effect
// re-runs / strict-mode double-fires can't queue a second navigation.

// "A navigation was issued" — set only immediately before the assign, so a
// failed attempt (missing env) doesn't strand later calls.
let redirecting = false;

// bfcache: Back/Forward can restore this document with the module state
// intact and no effect re-run — the latch would then block every redirect
// and auth state could be stale. Reload once so the page re-evaluates its
// session from scratch. (window guard: client components also evaluate
// during SSR.)
if (typeof window !== "undefined") {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && redirecting) {
      redirecting = false;
      window.location.reload();
    }
  });
}

function webUrl(): string {
  const url = process.env.NEXT_PUBLIC_WEB_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_WEB_URL is not set");
  }
  return url;
}

/**
 * Send an unauthenticated visitor to the marketing app's sign-in page,
 * carrying the current URL as returnTo so a successful sign-in lands back
 * on this exact deep link. apps/web validates returnTo against the
 * dashboard origin before honoring it.
 */
export function redirectToSignIn(): void {
  if (redirecting) return;
  const target = `${webUrl()}/sign-in?returnTo=${encodeURIComponent(window.location.href)}`;
  redirecting = true;
  window.location.assign(target);
}

/** Post-sign-out landing: the marketing site root. */
export function redirectToMarketing(): void {
  if (redirecting) return;
  const target = webUrl();
  redirecting = true;
  window.location.assign(target);
}
