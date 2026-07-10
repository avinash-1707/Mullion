"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../lib/auth-client";
import { useSignOutMutation } from "../../hooks/use-auth-mutations";
import { Button } from "../../components/ui/button";
import { DashboardSkeleton } from "../../components/dashboard-skeleton";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const signOut = useSignOutMutation();

  // Client-side sign-in wall: no session once loading has settled sends the
  // user to /sign-in. Hooks all run unconditionally above the early return
  // below, so this stays compliant with the rules of hooks.
  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/sign-in");
    }
  }, [isPending, session, router]);

  if (isPending || !session) {
    return <DashboardSkeleton />;
  }

  function handleSignOut() {
    signOut.mutate(undefined, { onSuccess: () => router.push("/") });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">
            Welcome, {session.user.name || session.user.email}
          </h1>
          <p className="mt-1.5 text-sm text-fg-muted">{session.user.email}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleSignOut} disabled={signOut.isPending}>
          {signOut.isPending ? "Signing out…" : "Sign out"}
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-border-strong px-3 py-1 font-mono text-xs text-fg-muted">
          Org: {activeOrganization?.name ?? "—"}
        </span>
      </div>

      <div className="mt-10 rounded-2xl border border-dashed border-border-strong bg-surface p-10 text-center">
        <p className="text-sm font-medium text-fg">Planning sessions arrive in Phase 1.</p>
        <p className="mt-1.5 text-sm text-fg-muted">
          This is where you&apos;ll describe an idea and watch agents plan its architecture live.
        </p>
        <Button variant="secondary" size="sm" disabled className="mt-6">
          New session
        </Button>
      </div>
    </div>
  );
}
