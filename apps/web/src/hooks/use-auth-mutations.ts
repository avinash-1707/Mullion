"use client";

import { useMutation } from "@tanstack/react-query";
import { authClient } from "../lib/auth-client";

interface SignInInput {
  email: string;
  password: string;
}

interface SignUpInput {
  email: string;
  password: string;
  name: string;
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
        throw new Error(error.message ?? "Sign in failed. Check your email and password.");
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
