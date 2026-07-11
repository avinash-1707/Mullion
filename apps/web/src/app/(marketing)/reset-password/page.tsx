import type { Metadata } from "next";
import { createMetadata } from "@/config/metadata";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = createMetadata({
  title: "Reset password",
  description: "Choose a new Mullion password.",
  path: "/reset-password",
  noIndex: true,
});

interface ResetPasswordPageProps {
  searchParams: Promise<{ email?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { email } = await searchParams;

  return (
    <AuthShell
      eyebrow="Reset password"
      title={
        <>
          Choose a <span className="text-ember">new password.</span>
        </>
      }
      subtitle="Enter the code we emailed you along with your new password."
    >
      <ResetPasswordForm initialEmail={email ?? ""} />
    </AuthShell>
  );
}
