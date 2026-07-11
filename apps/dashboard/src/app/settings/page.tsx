"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { redirectToSignIn } from "@/lib/auth-redirect";
import { SettingsSkeleton } from "@/components/settings-skeleton";
import { ProfileSection } from "@/components/settings/profile-section";
import { SecuritySection } from "@/components/settings/security-section";
import { ConnectedAccountsSection } from "@/components/settings/connected-accounts-section";

export default function SettingsPage() {
  const { data: session, isPending } = authClient.useSession();

  // Same client-side sign-in wall as the dashboard home: no session once
  // loading has settled sends the user to the marketing app's /sign-in.
  useEffect(() => {
    if (!isPending && !session) {
      redirectToSignIn();
    }
  }, [isPending, session]);

  if (isPending || !session) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16 lg:py-20">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">Settings</p>
      <h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight text-fg">Account</h1>
      <p className="mt-2 text-sm text-fg-muted">Manage your profile, password, and connected accounts.</p>

      <div className="mt-14 border-t border-hairline pt-14">
        <ProfileSection />
      </div>
      <div className="mt-14 border-t border-hairline pt-14">
        <SecuritySection />
      </div>
      <div className="mt-14 border-t border-hairline pt-14">
        <ConnectedAccountsSection />
      </div>
    </div>
  );
}
