"use client";

import Link from "next/link";
import { authClient } from "../lib/auth-client";
import { MullionMark } from "./mullion-mark";
import { Skeleton } from "./ui/skeleton";
import { buttonVariants } from "./ui/button";

// Signed-in chrome only: every page in this app is auth-gated, so there is
// no signed-out branch — an unauthenticated visitor is redirected to the
// marketing app's sign-in before this header matters.
export function SiteHeader() {
  const { data: session, isPending } = authClient.useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-bg/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="transition-swift flex items-center gap-2.5 text-fg hover:text-ember"
        >
          <MullionMark className="h-6 w-6" />
          <span className="font-serif text-xl tracking-tight">Mullion</span>
        </Link>

        {isPending || !session ? (
          <Skeleton className="h-9 w-28" />
        ) : (
          <div className="flex items-center gap-5">
            <span className="hidden max-w-[10rem] truncate font-mono text-xs text-fg-muted sm:inline">
              {session.user.email}
            </span>
            <Link href="/builds" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Builds
            </Link>
            <Link href="/" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Dashboard
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
