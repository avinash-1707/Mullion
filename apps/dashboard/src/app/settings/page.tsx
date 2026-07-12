"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { redirectToSignIn } from "@/lib/auth-redirect";
import { SettingsSkeleton } from "@/components/settings-skeleton";
import { SettingsTabs } from "@/components/settings/settings-tabs";

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
    <div className="mx-auto w-full max-w-3xl px-6 py-16 lg:py-20">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">Settings</p>
      <h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight text-fg">Account</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Manage your profile, password, connected accounts, models, and usage.
      </p>

      <SettingsTabs />
    </div>
  );
}
