import type { NextConfig } from "next";

// Security headers on every response (Phase 3 audit). The whole app renders
// untrusted LLM/agent output, and the build dashboard carries one-click
// mutations (escalation approve/abandon) — frame-ancestors closes the
// clickjacking angle, the rest are cheap defense-in-depth against a future
// HTML sink. A full script-src CSP is deferred (Next inline styles/scripts
// need nonce plumbing); frame-ancestors + object-src/base-uri already close
// the load-bearing gaps.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // @mullion/schemas ships TypeScript source with NodeNext-style ".js"
  // import specifiers — transpiling it lets the bundler apply TS extension
  // substitution instead of literally resolving the .js paths.
  transpilePackages: ["@mullion/schemas"],
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
};

export default nextConfig;
