"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { buildRunListPageSchema } from "@mullion/schemas";
import { authClient } from "@/lib/auth-client";
import { redirectToSignIn } from "@/lib/auth-redirect";
import { apiFetch } from "@/lib/api";
import { DashboardSkeleton } from "@/components/dashboard-skeleton";
import { IdeaIntakeForm } from "@/components/planning/idea-intake-form";
import { BuildListRow } from "@/components/build/build-list-row";
import { Skeleton } from "@/components/ui/skeleton";

const RECENT_BUILDS_ID = "recent-builds";

export default function DashboardPage() {
  const { data: session, isPending } = authClient.useSession();

  // Client-side sign-in wall: no session once loading has settled sends the
  // user to the marketing app's /sign-in with a returnTo back here. Hooks
  // all run unconditionally above the early return below, so this stays
  // compliant with the rules of hooks.
  useEffect(() => {
    if (!isPending && !session) {
      redirectToSignIn();
    }
  }, [isPending, session]);

  // First page of the paginated builds list (ADR-77), asked for at exactly
  // the 3 rows shown below the fold; enabled once a session exists so it
  // never fires for a signed-out visitor mid-redirect.
  const runsQuery = useQuery({
    queryKey: ["builds", "recent"],
    queryFn: async () => buildRunListPageSchema.parse(await apiFetch("/api/builds?limit=3")),
    enabled: Boolean(session),
  });

  if (isPending || !session) {
    return <DashboardSkeleton />;
  }

  const recentRuns = runsQuery.data?.items ?? [];

  return (
    <>
      {/* HERO — full-bleed artwork behind a centered idea intake. The
          artwork is edge-anchored: two marble hands reach in from the left
          and right at mid-height with the center deliberately empty, so the
          headline + form sit between the palms with nothing behind the
          text. `min-h` (not `h-`) so short content never clips and a mobile
          viewport with a taller intake card can grow past 100dvh instead
          of overlapping the section below. */}
      <section className="relative isolate flex min-h-[calc(100dvh_-_4rem)] flex-col overflow-hidden lg:min-h-[100dvh]">
        <Image
          src="/dashboard/transform.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center [mask-image:linear-gradient(to_bottom,black_0%,black_72%,transparent_100%)]"
        />

        <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-6 text-center">
          <div className="flex-1" />

          <div className="animate-reveal">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">New build</p>
            <h1 className="mt-4 font-serif text-4xl leading-tight tracking-tight text-fg">What will you build?</h1>
            <p className="mt-3 text-sm text-fg-muted">
              Describe the idea. Mullion plans the architecture, then builds it for you.
            </p>
          </div>

          <div className="animate-reveal mt-10 w-full" style={{ animationDelay: "90ms" }}>
            <IdeaIntakeForm />
          </div>

          <div className="flex-1" />

          <a
            href={`#${RECENT_BUILDS_ID}`}
            className="transition-swift pb-6 font-mono text-[11px] uppercase tracking-[0.25em] text-fg-faint hover:text-ember focus-visible:text-ember focus-visible:outline-none"
          >
            Recent builds <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      {/* RECENT BUILDS — revealed on scroll, below the hero's fold. */}
      <section id={RECENT_BUILDS_ID} className="mx-auto w-full max-w-4xl border-t border-hairline px-6 py-14 lg:py-16">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">Recent builds</h2>
          <Link
            href="/builds"
            className="transition-swift group flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted hover:text-ember focus-visible:text-ember focus-visible:outline-none"
          >
            View all
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          {runsQuery.isLoading ? (
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)
          ) : runsQuery.isError ? (
            <p role="alert" className="text-sm text-danger">
              Couldn&apos;t load recent builds - {runsQuery.error.message}
            </p>
          ) : recentRuns.length === 0 ? (
            <p className="text-sm text-fg-muted">No builds yet - your first build will appear here.</p>
          ) : (
            recentRuns.map((run) => <BuildListRow key={run.id} run={run} />)
          )}
        </div>
      </section>
    </>
  );
}
