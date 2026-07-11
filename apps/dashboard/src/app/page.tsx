"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { redirectToMarketing, redirectToSignIn } from "@/lib/auth-redirect";
import { useSignOutMutation } from "@/hooks/use-auth-mutations";
import { Button } from "@/components/ui/button";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { IdeaIntakeForm } from "@/components/planning/idea-intake-form";

export default function DashboardPage() {
  const { data: session, isPending } = authClient.useSession();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const signOut = useSignOutMutation();

  // Client-side sign-in wall: no session once loading has settled sends the
  // user to the marketing app's /sign-in with a returnTo back here. Hooks
  // all run unconditionally above the early return below, so this stays
  // compliant with the rules of hooks.
  useEffect(() => {
    if (!isPending && !session) {
      redirectToSignIn();
    }
  }, [isPending, session]);

  if (isPending || !session) {
    return <DashboardSkeleton />;
  }

  function handleSignOut() {
    signOut.mutate(undefined, { onSuccess: () => redirectToMarketing() });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16 lg:py-20">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">Dashboard</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight text-fg">
            Welcome, {session.user.name || session.user.email}
          </h1>
          <p className="mt-2 text-sm text-fg-muted">{session.user.email}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleSignOut} disabled={signOut.isPending}>
          {signOut.isPending ? "Signing out…" : "Sign out"}
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="border border-gilt/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-gilt">
          Org: {activeOrganization?.name ?? "—"}
        </span>
      </div>

      <div className="mt-14 border-t border-hairline pt-14">
        <IdeaIntakeForm />
      </div>
    </div>
  );
}
