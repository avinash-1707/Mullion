import type { Metadata } from "next";
import { createMetadata } from "@/config/metadata";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = createMetadata({
  title: "Forgot password",
  description: "Get back into your Mullion account with an emailed code.",
  path: "/forgot-password",
  noIndex: true,
});

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title={
        <>
          Let&apos;s get you <span className="text-ember">back in.</span>
        </>
      }
      subtitle="Enter your email and we'll send you a code."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
