import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request Content-Security-Policy with a script nonce (Phase 3 audit
 * #2.6). A nonce is by definition per-request, so it can't live in
 * next.config's static `headers()` — it belongs here in `proxy` (this Next
 * version's rename of `middleware`; see node_modules/next docs). Next reads
 * the `'nonce-…'` out of this header during SSR and stamps it onto every
 * framework/page script automatically, so no <Script> needs a manual nonce.
 *
 * This is the SINGLE source of truth for the CSP header — next.config emits
 * only the non-CSP static headers (X-Frame-Options / nosniff / Referrer).
 * Emitting a CSP in both places would ship two conflicting headers.
 *
 * script-src is the load-bearing control: 'nonce' + 'strict-dynamic' means an
 * injected <script> without our per-request nonce cannot execute, which is
 * exactly the XSS hole the audit flagged. style-src stays 'unsafe-inline'
 * deliberately — React renders inline `style={{…}}` attributes that cannot
 * carry a nonce, and style injection is a far lower risk than script
 * execution; tightening it would break rendering for no meaningful gain.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  // The API is a separate origin (Hono); the app fetches it and opens an SSE
  // EventSource to it, so connect-src must allow it or every request breaks.
  let apiOrigin = "";
  try {
    if (process.env.NEXT_PUBLIC_API_URL) apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL).origin;
  } catch {
    apiOrigin = "";
  }

  const csp = [
    `default-src 'self'`,
    // 'unsafe-eval' only in dev — React uses eval for richer error overlays.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    // https: because avatars are arbitrary user-set https URLs (ADR-66) —
    // Google/GitHub picture hosts plus whatever the user pastes in settings.
    // img-src can't execute script, so the residual risk is an image beacon,
    // which the avatar owner could already place via their own profile.
    `img-src 'self' blob: data: https:`,
    `font-src 'self'`,
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ""}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    // Upgrade http→https in prod only; in dev it would rewrite the http
    // localhost API origin to https and break every call.
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ].join("; ");

  // Next reads the nonce from the request-side CSP header during render; the
  // response-side header is what the browser actually enforces.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Every HTML route, but skip Next's own static assets/image optimizer and
    // the favicon (they need no nonce), and skip link-prefetch requests so a
    // prefetched shell can't cache a stale nonce.
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
