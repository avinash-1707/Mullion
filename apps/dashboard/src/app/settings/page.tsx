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
    // Top padding tighter than the home page's py-16/20: no visible heading
    // here, so the tab row sits closer to the header instead of floating.
    <div className="mx-auto w-full max-w-3xl px-6 pb-16 pt-8 lg:pb-20 lg:pt-10">
      {/* Visible heading dropped by design — the tab list is the page's top
          element; screen readers still get a page title. */}
      <h1 className="sr-only">Settings</h1>
      <SettingsTabs />
    </div>
  );
}
