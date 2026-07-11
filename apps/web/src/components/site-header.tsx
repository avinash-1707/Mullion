"use client";

import Link from "next/link";
import { authClient } from "../lib/auth-client";
import { MullionMark } from "./mullion-mark";
import { Skeleton } from "./ui/skeleton";
import { buttonVariants } from "./ui/button";

export function SiteHeader() {
  const { data: session, isPending } = authClient.useSession();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="transition-swift flex items-center gap-2 text-fg hover:text-accent-strong"
        >
          <MullionMark className="h-6 w-6" />
          <span className="text-[15px] font-semibold tracking-tight">Mullion</span>
        </Link>

        {isPending ? (
          <Skeleton className="h-9 w-28" />
        ) : session ? (
          <div className="flex items-center gap-3">
            <span className="hidden max-w-[10rem] truncate font-mono text-xs text-fg-muted sm:inline">
              {session.user.email}
            </span>
            <Link href="/builds" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Builds
            </Link>
            <Link href="/dashboard" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Dashboard
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Sign in
            </Link>
            <Link href="/sign-up" className={buttonVariants({ variant: "primary", size: "sm" })}>
              Get started
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
