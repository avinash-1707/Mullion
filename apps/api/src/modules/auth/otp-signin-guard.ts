/**
 * ADR-66: passwordless OTP sign-in is allowed ONLY for accounts that have no
 * credential password (social-first accounts). For everyone else the OTP
 * routes are refused so a password can't be bypassed — and so we don't mail
 * codes that will never work. Pure predicate (which requests are OTP sign-in
 * attempts) kept separate from the DB check so it is unit-testable, matching
 * signin-guard.ts.
 */
export function isOtpSignInAttempt(
  path: string | undefined,
  body: { type?: string } | undefined,
): boolean {
  // Lowercase + strip trailing slashes: better-call routing is expected to
  // normalize case before this hook runs, but the guard must not be the
  // thing that breaks if that assumption ever changes.
  const normalizedPath = (path ?? "").toLowerCase().replace(/\/+$/, "");
  if (normalizedPath.endsWith("/sign-in/email-otp")) return true;
  // The send endpoint serves all OTP types; only the sign-in type is gated.
  return normalizedPath.endsWith("/email-otp/send-verification-otp") && body?.type === "sign-in";
}
