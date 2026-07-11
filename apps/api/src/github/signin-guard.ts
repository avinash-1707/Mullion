/**
 * ADR-56: GitHub is link-only, never a sign-in method. The effective guard
 * is /sign-in/social with provider=github. Extracted as a pure predicate so
 * it is unit-testable without a Better Auth harness.
 */
export function isBlockedGitHubSignin(
  path: string | undefined,
  body: { provider?: string } | undefined,
): boolean {
  const normalizedPath = (path ?? "").replace(/\/+$/, "");
  return normalizedPath.endsWith("/sign-in/social") && body?.provider === "github";
}
