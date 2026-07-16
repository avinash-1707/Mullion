"use client";

import { useEffect, type CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { buildListPageSchema } from "@mullion/schemas";
import { authClient } from "@/lib/auth-client";
import { redirectToSignIn } from "@/lib/auth-redirect";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-in-view";
import { IdeaIntakeForm } from "@/components/planning/idea-intake-form";
import { BuildCard } from "@/components/build/build-card";

const RECENT_BUILDS_ID = "recent-builds";

// Carries each header/row's position into CSS as `--row-index`, read by
// `.scroll-reveal`'s stagger delay in globals.css — same mechanism as
// app-sidebar.tsx's `RailRowStyle`. React.CSSProperties has a closed type,
// so extending it locally keeps the object literal typed without an `as`
// cast on the value itself.
interface RowRevealStyle extends CSSProperties {
  "--row-index"?: number;
}

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

  // First page of the paginated builds list (ADR-77/83) — one row per idea
  // whatever its stage — asked for at exactly the 3 rows shown below the
  // fold; enabled once a session exists so it never fires for a signed-out
  // visitor mid-redirect.
  const buildsQuery = useQuery({
    queryKey: ["builds", "recent"],
    queryFn: async () => buildListPageSchema.parse(await apiFetch("/api/builds?limit=3")),
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
  // A signed-out visitor sees the hero for the moment it takes the
  // redirect effect above to fire — submitting the form still requires
  // auth server-side, so nothing is reachable in that window.
  const recentBuilds = buildsQuery.data?.items ?? [];
  // The whole recent-builds surface — the hero's "Recent builds ↓" pointer
  // AND the section itself — exists only once the query has resolved with
  // at least one build. No skeletons, no empty state: a first-time user
  // gets a hero and nothing else. Pending/error render nothing too — the
  // section sits below the fold, so its late arrival is invisible, and an
  // error here is non-critical (the /builds page still surfaces it).
  const hasBuilds = recentBuilds.length > 0;

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

          {/* Mounts only once builds exist, so its animate-reveal plays at
              that moment rather than on the page's 360ms cascade slot — a
              quiet fade-in instead of a pop when the query resolves. The
              pb-6 spacer span keeps the hero's vertical rhythm identical
              with and without the pointer. */}
          {hasBuilds ? (
            <a
              href={`#${RECENT_BUILDS_ID}`}
              className="animate-reveal transition-swift pb-6 font-mono text-[11px] uppercase tracking-[0.25em] text-fg-faint hover:text-ember focus-visible:text-ember focus-visible:outline-none"
            >
              Recent builds <span aria-hidden="true">↓</span>
            </a>
          ) : (
            <span aria-hidden="true" className="pb-6 font-mono text-[11px] uppercase tracking-[0.25em]">
              &nbsp;
            </span>
          )}
        </div>
      </section>

      {/* RECENT BUILDS — revealed on scroll, below the hero's fold. Entrance
          is IntersectionObserver-driven (useInView), not scroll-driven CSS
          (`animation-timeline: view()`): Firefox has no support for that at
          all as of this writing, and IntersectionObserver is the pattern
          this codebase already uses for viewport-gated behavior (see
          idea-intake-form.tsx's placeholder-rotation pause). */}
      {hasBuilds && (
        <section
          id={RECENT_BUILDS_ID}
          ref={recentBuildsRef}
          className="mx-auto w-full max-w-4xl px-6 py-14 lg:py-16"
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

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentBuilds.map((build, index) => {
              const style: RowRevealStyle = { "--row-index": index + 1 };
              return (
                <div key={build.id} className={cn("scroll-reveal", recentBuildsInView && "in-view")} style={style}>
                  <BuildCard build={build} />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
