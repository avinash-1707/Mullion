"use client";

import { useMutation } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client";

interface SignInInput {
  email: string;
  password: string;
  /** When false the session ends when the browser closes (Better Auth). */
  rememberMe?: boolean;
}

interface SignUpInput {
  email: string;
  password: string;
  name: string;
}

// Thrown in place of a plain Error so a caller that needs to branch on
// *which* failure this was (not just render the message) has something to
// switch on — currently only sign-in's EMAIL_NOT_VERIFIED case needs this;
// every other mutation below throws a plain Error since its callers only
// ever display the message.
export class AuthMutationError extends Error {
  // `string | undefined` (not `?:`) — exactOptionalPropertyTypes forbids
  // assigning a possibly-undefined value to an optional property.
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "AuthMutationError";
    this.code = code;
  }
}

// authClient calls resolve to { data, error } rather than rejecting — these
// hooks convert a populated `error` into a thrown Error so useMutation's own
// error/isPending state becomes the single source of truth callers render
// from, instead of every form re-deriving it from the raw response shape.

export function useSignInMutation() {
  return useMutation({
    mutationFn: async (input: SignInInput) => {
      const { data, error } = await authClient.signIn.email(input);
      if (error) {
        // Not the generic "wrong password" case — the server throws this
        // (403 EMAIL_NOT_VERIFIED) when requireEmailVerification blocks an
        // otherwise-correct sign-in. Callers branch on `.code` to route to
        // /verify-email instead of rendering this inline.
        throw new AuthMutationError(
          error.message ?? "Sign in failed. Check your email and password.",
          error.code,
        );
      }
      return data;
    },
  });
}

export function useSignUpMutation() {
  return useMutation({
    mutationFn: async (input: SignUpInput) => {
      const { data, error } = await authClient.signUp.email(input);
      if (error) {
        throw new Error(error.message ?? "Sign up failed. Try a different email.");
      }
      return data;
    },
  });
}

export function useSignOutMutation() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      if (error) {
        throw new Error(error.message ?? "Sign out failed.");
      }
    },
  });
}

// --- Social / OAuth2 sign-in --------------------------------------------
//
// Both redirect the browser away to the provider on success (better-auth's
// default `disableRedirect: false`), so onSuccess rarely runs — the
// mutation still gives each button its own isPending/error state for the
// brief window before the redirect fires, and for the rare case the
// provider call fails before ever leaving the page (e.g. misconfiguration).

export function useSignInSocialMutation() {
  return useMutation({
    mutationFn: async (input: { provider: "google"; callbackURL: string }) => {
      const { data, error } = await authClient.signIn.social(input);
      if (error) {
        throw new Error(error.message ?? "Couldn't reach Google. Try again.");
      }
      return data;
    },
  });
}

export function useSignInOAuth2Mutation() {
  return useMutation({
    mutationFn: async (input: { providerId: "github-login"; callbackURL: string }) => {
      const { data, error } = await authClient.signIn.oauth2(input);
      if (error) {
        throw new Error(error.message ?? "Couldn't reach GitHub. Try again.");
      }
      return data;
    },
  });
}

// --- Email OTP sign-in ---------------------------------------------------
//
// Only social-first accounts (no password) can use this path — the server
// 403s both routes below with "This account has a password — sign in with
// it instead." for a credentialed account, and callers render that message
// as-is rather than special-casing it.

export function useSendSignInOtpMutation() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      if (error) {
        throw new Error(error.message ?? "Couldn't send a code. Try again.");
      }
      return data;
    },
  });
}

export function useVerifySignInOtpMutation() {
  return useMutation({
    mutationFn: async (input: { email: string; otp: string }) => {
      const { data, error } = await authClient.signIn.emailOtp(input);
      if (error) {
        throw new Error(error.message ?? "That code didn't work. Check it and try again.");
      }
      return data;
    },
  });
}

// --- Email verification ---------------------------------------------------

export function useSendEmailVerificationOtpMutation() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });
      if (error) {
        throw new Error(error.message ?? "Couldn't send a code. Try again.");
      }
      return data;
    },
  });
}

export function useVerifyEmailOtpMutation() {
  return useMutation({
    mutationFn: async (input: { email: string; otp: string }) => {
      // autoSignInAfterVerification is on server-side, so success here also
      // means a session now exists (Set-Cookie on this response).
      const { data, error } = await authClient.emailOtp.verifyEmail(input);
      if (error) {
        throw new Error(error.message ?? "That code didn't work. Check it and try again.");
      }
      return data;
    },
  });
}

// --- Password reset (OTP-based, not link-based) ---------------------------

export function useRequestPasswordResetMutation() {
  return useMutation({
    mutationFn: async (email: string) => {
      // Enumeration-safe: the server returns success whether or not the
      // email is registered, so callers always render the success state on
      // a resolved promise and only show an error for a genuine network/
      // server failure.
      const { error } = await authClient.emailOtp.requestPasswordReset({ email });
      if (error) {
        throw new Error(error.message ?? "Something went wrong. Try again.");
      }
    },
  });
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: async (input: { email: string; otp: string; password: string }) => {
      const { error } = await authClient.emailOtp.resetPassword(input);
      if (error) {
        throw new Error(error.message ?? "That code didn't work. Check it and try again.");
      }
    },
  });
}
