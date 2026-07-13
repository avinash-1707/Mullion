"use client";

import { useEffect, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { buildRunListPageSchema } from "@mullion/schemas";
import { authClient } from "@/lib/auth-client";
import { redirectToSignIn } from "@/lib/auth-redirect";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-in-view";
import { IdeaIntakeForm } from "@/components/planning/idea-intake-form";
import { BuildListRow } from "@/components/build/build-list-row";
import { Skeleton } from "@/components/ui/skeleton";

const RECENT_BUILDS_ID = "recent-builds";

// Carries each header/row's position into CSS as `--row-index`, read by
// `.scroll-reveal`'s stagger delay in globals.css — same mechanism as
// app-sidebar.tsx's `RailRowStyle`. React.CSSProperties has a closed type,
// so extending it locally keeps the object literal typed without an `as`
// cast on the value itself.
interface RowRevealStyle extends CSSProperties {
  "--row-index"?: number;
}

// Shared by the single-element branches below (error/empty) — both sit
// right under the header row, so both get the same fixed stagger slot.
const FIRST_ROW_STYLE: RowRevealStyle = { "--row-index": 1 };

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

  // Recent-builds entrance: this section mounts with the rest of the page
  // (it's just below the fold), so it needs its own visibility signal
  // rather than an autoplaying @keyframes reveal — see `.scroll-reveal` in
  // globals.css and use-in-view.ts for why.
  const { ref: recentBuildsRef, isInView: recentBuildsInView } = useInView<HTMLElement>();

  // No page-level skeleton here (unlike the other dashboard routes): the
  // hero is entirely static — artwork, copy, and the intake form need no
  // session data to render — so it paints immediately and the entrance
  // choreography starts at first paint instead of after auth resolves.
  // Only the recent-builds rows below actually depend on the session; they
  // hold their row skeletons until it settles. A signed-out visitor sees
  // the hero for the moment it takes the redirect effect above to fire —
  // submitting the form still requires auth server-side, so nothing is
  // reachable in that window.
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
          preload
          sizes="100vw"
          className="animate-hero-settle object-cover object-center [mask-image:linear-gradient(to_bottom,black_0%,black_72%,transparent_100%)]"
        />

        {/* Entrance choreography: the artwork above settles on its own
            (0-900ms, transform only). The eyebrow/headline/subline/form/
            scroll-cue below cascade in on top of it in a 90ms-stepped
            sequence — same reveal each already used as one flat block,
            just split so the hierarchy arrives in reading order instead of
            all at once. Last delay (360ms) + its 600ms duration lands at
            960ms, so the whole page is at rest within ~1s of paint. */}
        <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-6 text-center">
          <div className="flex-1" />

          <p className="animate-reveal font-mono text-[11px] uppercase tracking-[0.3em] text-gilt">New build</p>
          <h1
            className="animate-reveal mt-4 font-serif text-4xl leading-tight tracking-tight text-fg"
            style={{ animationDelay: "90ms" }}
          >
            What will you build?
          </h1>
          <p className="animate-reveal mt-3 text-sm text-fg-muted" style={{ animationDelay: "180ms" }}>
            Describe the idea. Mullion plans the architecture, then builds it for you.
          </p>

          <div className="animate-reveal mt-10 w-full" style={{ animationDelay: "270ms" }}>
            <IdeaIntakeForm />
          </div>

          <div className="flex-1" />

          <a
            href={`#${RECENT_BUILDS_ID}`}
            className="animate-reveal transition-swift pb-6 font-mono text-[11px] uppercase tracking-[0.25em] text-fg-faint hover:text-ember focus-visible:text-ember focus-visible:outline-none"
            style={{ animationDelay: "360ms" }}
          >
            Recent builds <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      {/* RECENT BUILDS — revealed on scroll, below the hero's fold. Entrance
          is IntersectionObserver-driven (useInView), not scroll-driven CSS
          (`animation-timeline: view()`): Firefox has no support for that at
          all as of this writing, and IntersectionObserver is the pattern
          this codebase already uses for viewport-gated behavior (see
          idea-intake-form.tsx's placeholder-rotation pause). */}
      <section
        id={RECENT_BUILDS_ID}
        ref={recentBuildsRef}
        className="mx-auto w-full max-w-4xl border-t border-hairline px-6 py-14 lg:py-16"
      >
        <div
          className={cn("flex flex-wrap items-center justify-between gap-4 scroll-reveal", recentBuildsInView && "in-view")}
        >
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
          {/* isPending (not isLoading): the query is disabled until the
              session resolves, and a disabled query is pending-but-not-
              loading in TanStack v5. isPending keeps the row skeletons up
              through BOTH waits — auth settling, then the first fetch —
              instead of flashing the empty state in between. */}
          {runsQuery.isPending ? (
            [0, 1, 2].map((i) => {
              const style: RowRevealStyle = { "--row-index": i + 1 };
              return (
                <div key={i} className={cn("scroll-reveal", recentBuildsInView && "in-view")} style={style}>
                  <Skeleton className="h-16" />
                </div>
              );
            })
          ) : runsQuery.isError ? (
            <p
              role="alert"
              className={cn("scroll-reveal text-sm text-danger", recentBuildsInView && "in-view")}
              style={FIRST_ROW_STYLE}
            >
              Couldn&apos;t load recent builds - {runsQuery.error.message}
            </p>
          ) : recentRuns.length === 0 ? (
            <p
              className={cn("scroll-reveal text-sm text-fg-muted", recentBuildsInView && "in-view")}
              style={FIRST_ROW_STYLE}
            >
              No builds yet - your first build will appear here.
            </p>
          ) : (
            recentRuns.map((run, index) => {
              const style: RowRevealStyle = { "--row-index": index + 1 };
              return (
                <div key={run.id} className={cn("scroll-reveal", recentBuildsInView && "in-view")} style={style}>
                  <BuildListRow run={run} />
                </div>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}
