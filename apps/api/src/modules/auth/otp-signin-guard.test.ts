import { describe, expect, it } from "vitest";
import { isOtpSignInAttempt } from "./otp-signin-guard.js";

describe("isOtpSignInAttempt (ADR-66)", () => {
  it("matches the OTP sign-in endpoint", () => {
    expect(isOtpSignInAttempt("/sign-in/email-otp", { type: undefined })).toBe(true);
    expect(isOtpSignInAttempt("/api/auth/sign-in/email-otp", {})).toBe(true);
    expect(isOtpSignInAttempt("/sign-in/email-otp/", {})).toBe(true);
    // Case defense-in-depth: routing normalizes case upstream, but the guard
    // must not depend on it.
    expect(isOtpSignInAttempt("/SIGN-IN/EMAIL-OTP", {})).toBe(true);
  });

  it("matches the send endpoint ONLY for the sign-in OTP type", () => {
    expect(isOtpSignInAttempt("/email-otp/send-verification-otp", { type: "sign-in" })).toBe(true);
    expect(isOtpSignInAttempt("/email-otp/send-verification-otp", { type: "email-verification" })).toBe(false);
    expect(isOtpSignInAttempt("/email-otp/send-verification-otp", { type: "forget-password" })).toBe(false);
    expect(isOtpSignInAttempt("/email-otp/send-verification-otp", undefined)).toBe(false);
  });

  it("ignores unrelated paths — verify, reset, and password sign-in stay open", () => {
    expect(isOtpSignInAttempt("/email-otp/verify-email", { type: "email-verification" })).toBe(false);
    expect(isOtpSignInAttempt("/email-otp/reset-password", {})).toBe(false);
    expect(isOtpSignInAttempt("/sign-in/email", {})).toBe(false);
    expect(isOtpSignInAttempt(undefined, undefined)).toBe(false);
  });
});
