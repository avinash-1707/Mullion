import type { NextConfig } from "next";

// Static security headers on every response (Phase 3 audit). The
// Content-Security-Policy is DELIBERATELY NOT here — it needs a per-request
// script nonce, so it's emitted from src/proxy.ts (the single CSP source).
// These are the request-invariant headers; X-Frame-Options duplicates the
// CSP's frame-ancestors for pre-CSP browsers.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

// The product surface moved to the dashboard app (ADR-64); bookmarks and
// stale links to the old paths bounce there. Env-driven — no redirects if
// the var is absent (e.g. a build without env), never a hardcoded domain.
const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL;

const nextConfig: NextConfig = {
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
  redirects: async () =>
    dashboardUrl
      ? [
          { source: "/dashboard", destination: dashboardUrl, permanent: false },
          { source: "/builds", destination: `${dashboardUrl}/builds`, permanent: false },
          { source: "/builds/:id", destination: `${dashboardUrl}/builds/:id`, permanent: false },
          { source: "/sessions/:id", destination: `${dashboardUrl}/sessions/:id`, permanent: false },
        ]
      : [],
};

export default nextConfig;
