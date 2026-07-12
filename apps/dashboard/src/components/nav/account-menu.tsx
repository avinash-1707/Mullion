"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useSignOutMutation } from "@/hooks/use-auth-mutations";
import { redirectToMarketing } from "@/lib/auth-redirect";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { SignOutIcon } from "@/components/planning/icons";

interface AccountMenuProps {
  /**
   * `rail`: desktop sidebar footer — the avatar sits in the same fixed
   * 60px icon slot every nav row uses; email/sign-out live in the
   * hover-fade label region (`.mullion-rail-label`, globals.css).
   * `drawer`: mobile slide-over footer — always expanded, no fade.
   */
  variant: "rail" | "drawer";
  /** Drawer closes itself before the avatar link navigates away; the
   * rail has nothing that needs closing. */
  onNavigate?: () => void;
}

// Shared by the desktop rail footer and the mobile drawer footer so
// avatar/email/sign-out can never drift between the two surfaces —
// session state and the sign-out mutation are identical; only layout
// (fixed icon slot + fade vs. always-expanded row) differs by variant.
export function AccountMenu({ variant, onNavigate }: AccountMenuProps) {
  const { data: session, isPending } = authClient.useSession();
  const signOut = useSignOutMutation();
  const isRail = variant === "rail";

  function handleSignOut() {
    signOut.mutate(undefined, { onSuccess: () => redirectToMarketing() });
  }

  if (isPending || !session) {
    return (
      <div className={cn("flex items-center", isRail ? "h-16" : "gap-3 px-3 py-3")}>
        <span className={cn("flex shrink-0 items-center justify-center", isRail && "h-16 w-[60px]")}>
          <Skeleton className="h-8 w-8" />
        </span>
        <Skeleton className={cn("h-3 w-24", isRail && "mullion-rail-label")} />
      </div>
    );
  }

  const email = session.user.email;

  return (
    <div className={cn("flex items-center", isRail ? "h-16" : "gap-1 px-2 py-2")}>
      <Link
        href="/settings"
        onClick={() => onNavigate?.()}
        aria-label="Account settings"
        className={cn(
          "transition-swift flex shrink-0 items-center justify-center hover:bg-elevated",
          isRail ? "h-16 w-[60px]" : "h-11 w-11",
        )}
      >
        <Avatar name={session.user.name ?? ""} email={email} image={session.user.image} />
      </Link>

      {/* Email + sign-out travel together as one fade region on the rail
          (matches every nav row: fixed icon slot, then a flex-1
          overflow-hidden label that has zero space to occupy while the
          rail is collapsed) so neither pops out past the 60px rest
          width. */}
      <div className={cn("flex min-w-0 flex-1 items-center", isRail && "mullion-rail-label overflow-hidden")}>
        <span className="min-w-0 flex-1 truncate px-1 font-mono text-xs text-fg-muted" title={email}>
          {email}
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signOut.isPending}
          aria-label="Sign out"
          className="transition-swift flex h-9 w-9 shrink-0 items-center justify-center text-fg-faint hover:bg-danger-soft hover:text-danger disabled:pointer-events-none disabled:opacity-45"
        >
          <SignOutIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
