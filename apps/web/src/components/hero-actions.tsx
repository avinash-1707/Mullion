"use client";

import Link from "next/link";
import { authClient } from "../lib/auth-client";
import { buttonVariants } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

// The landing page's only session-dependent piece — split out so the rest
// of the hero can stay a plain server-rendered section instead of the whole
// page paying for a client boundary.
export function HeroActions() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex gap-3">
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-12 w-32" />
      </div>
    );
  }

  if (session) {
    return (
      <Link href="/dashboard" className={buttonVariants({ size: "md" })}>
        Go to dashboard
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Link href="/sign-up" className={buttonVariants({ size: "md" })}>
        Get started
      </Link>
      <Link href="/sign-in" className={buttonVariants({ variant: "secondary", size: "md" })}>
        Sign in
      </Link>
    </div>
  );
}
