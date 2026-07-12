"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { redirectToSignIn } from "@/lib/auth-redirect";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { IdeaIntakeForm } from "@/components/planning/idea-intake-form";

export default function DashboardPage() {
  const { data: session, isPending } = authClient.useSession();
  const { data: activeOrganization } = authClient.useActiveOrganization();

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

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-16 lg:py-20">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">Dashboard</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight tracking-tight text-fg">
          Welcome, {session.user.name || session.user.email}
        </h1>
        <p className="mt-2 text-sm text-fg-muted">{session.user.email}</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-gilt/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-gilt">
          Org: {activeOrganization?.name ?? "—"}
        </span>
      </div>

      <div className="mt-14 border-t border-hairline pt-14">
        <IdeaIntakeForm />
      </div>
    </div>
  );
}
