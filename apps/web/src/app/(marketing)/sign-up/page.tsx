import type { Metadata } from "next";
import { createMetadata } from "@/config/metadata";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = createMetadata({
  title: "Create an account",
  description: "Create a Mullion account and turn your first idea into a shipped project.",
  path: "/sign-up",
  noIndex: true,
});

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Begin"
      title={
        <>
          Your first build <span className="text-ember">starts here.</span>
        </>
      }
      subtitle="One account, and the crew is at your drawing board."
    >
      <SignUpForm />
    </AuthShell>
  );
}
