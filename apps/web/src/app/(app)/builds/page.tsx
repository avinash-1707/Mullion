"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { buildRunListSchema } from "@mullion/schemas";
import { authClient } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { BuildListSkeleton } from "@/components/build/build-skeletons";
import { SessionErrorState } from "@/components/planning/session-error-state";
import { BuildListRow } from "@/components/build/build-list-row";
import { BuildIcon } from "@/components/planning/icons";
import { buttonVariants } from "@/components/ui/button";

export default function BuildsPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) router.replace("/sign-in");
  }, [isPending, session, router]);

  const runsQuery = useQuery({
    queryKey: ["builds"],
    queryFn: async () => buildRunListSchema.parse(await apiFetch("/api/builds")),
    enabled: Boolean(session),
  });

  if (isPending || !session) {
    return <DashboardSkeleton />;
  }

  if (runsQuery.isLoading) {
    return <BuildListSkeleton />;
  }

  if (runsQuery.isError) {
    return <SessionErrorState title="Couldn't load builds" message={runsQuery.error.message} />;
  }

  const runs = runsQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Builds</h1>
          <p className="mt-1.5 text-sm text-fg-muted">Your organization&apos;s 20 most recent automated build runs.</p>
        </div>
        <Link href="/dashboard" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          ← Dashboard
        </Link>
      </div>

      {runs.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-16 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
            <BuildIcon className="h-5 w-5" />
          </span>
          <h2 className="text-base font-semibold text-fg">No builds yet</h2>
          <p className="max-w-sm text-sm text-fg-muted">
            Builds start from a confirmed planning session — freeze an architecture, then choose &ldquo;Build it for us.&rdquo;
          </p>
          <Link href="/dashboard" className={buttonVariants({ variant: "primary", size: "sm" })}>
            Go to dashboard
          </Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-2.5">
          {runs.map((run) => (
            <BuildListRow key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
