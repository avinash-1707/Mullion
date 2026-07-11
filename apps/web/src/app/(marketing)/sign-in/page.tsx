import type { Metadata } from "next";
import { createMetadata } from "@/config/metadata";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = createMetadata({
  title: "Sign in",
  description: "Sign in to Mullion and pick up where you left off.",
  path: "/sign-in",
  noIndex: true,
});

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="Welcome back"
      title={
        <>
          Pick up where <span className="text-ember">you left off.</span>
        </>
      }
      subtitle="Your plans and builds are exactly where you parked them."
    >
      <SignInForm />
    </AuthShell>
  );
}
