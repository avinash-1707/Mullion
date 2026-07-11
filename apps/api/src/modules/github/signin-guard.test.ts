import { describe, expect, it } from "vitest";
import { isBlockedGitHubSignin } from "./signin-guard.js";

describe("isBlockedGitHubSignin (ADR-56)", () => {
  it("blocks github on /sign-in/social", () => {
    expect(isBlockedGitHubSignin("/sign-in/social", { provider: "github" })).toBe(true);
    expect(isBlockedGitHubSignin("/api/auth/sign-in/social", { provider: "github" })).toBe(true);
    expect(isBlockedGitHubSignin("/sign-in/social/", { provider: "github" })).toBe(true);
  });

  it("allows other providers on /sign-in/social", () => {
    expect(isBlockedGitHubSignin("/sign-in/social", { provider: "google" })).toBe(false);
  });

  it("does not block the OAuth callback (link-social uses it; no body.provider)", () => {
    expect(isBlockedGitHubSignin("/callback/github", undefined)).toBe(false);
    expect(isBlockedGitHubSignin("/callback/github", {})).toBe(false);
  });

  it("does not block unrelated paths or missing input", () => {
    expect(isBlockedGitHubSignin("/link-social", { provider: "github" })).toBe(false);
    expect(isBlockedGitHubSignin(undefined, undefined)).toBe(false);
  });
});
