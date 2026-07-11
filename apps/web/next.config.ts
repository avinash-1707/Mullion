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

const nextConfig: NextConfig = {
  // @mullion/schemas ships TypeScript source with NodeNext-style ".js"
  // import specifiers — transpiling it lets the bundler apply TS extension
  // substitution instead of literally resolving the .js paths.
  transpilePackages: ["@mullion/schemas"],
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
};

export default nextConfig;
