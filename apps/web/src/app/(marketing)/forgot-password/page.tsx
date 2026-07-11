import type { Metadata } from "next";
import { createMetadata } from "@/config/metadata";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = createMetadata({
  title: "Forgot password",
  description: "Reset your Mullion password with an emailed code.",
  path: "/forgot-password",
  noIndex: true,
});

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Reset password"
      title={
        <>
          Let&apos;s get you <span className="text-ember">back in.</span>
        </>
      }
      subtitle="Enter your email and we'll send a code to reset your password."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
