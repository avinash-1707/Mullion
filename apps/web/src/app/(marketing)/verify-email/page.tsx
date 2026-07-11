import type { Metadata } from "next";
import { createMetadata } from "@/config/metadata";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";

export const metadata: Metadata = createMetadata({
  title: "Verify your email",
  description: "Confirm your email to finish setting up Mullion.",
  path: "/verify-email",
  noIndex: true,
});

interface VerifyEmailPageProps {
  searchParams: Promise<{ email?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const { email } = await searchParams;

  return (
    <AuthShell
      eyebrow="One more step"
      title={
        <>
          Confirm it&apos;s <span className="text-ember">really you.</span>
        </>
      }
      subtitle="Enter the code we just emailed you to finish setting up your account."
    >
      <VerifyEmailForm initialEmail={email ?? ""} />
    </AuthShell>
  );
}
