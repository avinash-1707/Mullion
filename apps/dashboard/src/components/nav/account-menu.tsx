"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useSignOutMutation } from "@/hooks/use-auth-mutations";
import { redirectToMarketing } from "@/lib/auth-redirect";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { SignOutIcon } from "@/components/planning/icons";
import { SignOutDialog } from "./sign-out-dialog";

interface AccountMenuProps {
  /**
   * `rail`: desktop sidebar footer — the avatar sits in the same fixed
   * 60px icon slot every nav row uses; name/sign-out live in the
   * hover-fade label region (`.mullion-rail-label`, globals.css).
   * `drawer`: mobile slide-over footer — always expanded, no fade.
   */
  variant: "rail" | "drawer";
  /** Drawer closes itself before the avatar link navigates away; the
   * rail has nothing that needs closing. */
  onNavigate?: () => void;
}

// Blank/whitespace-only name (legacy accounts, OAuth providers that don't
// return one) falls back to email rather than rendering an empty label.
function resolveDisplayName(name: string, email: string): string {
  const trimmed = name.trim();
  return trimmed || email;
}

// Shared by the desktop rail footer and the mobile drawer footer so
// avatar/name/sign-out can never drift between the two surfaces —
// session state and the sign-out mutation are identical; only layout
// (fixed icon slot + fade vs. always-expanded row) differs by variant.
//
// Two stacked rows, not one: row 1 (avatar + name) still links to
// /settings exactly as before; row 2 (sign-out) is now a full nav-row-style
// hit target of its own rather than a small button bolted onto the profile
// row, so a mis-click can't fire it. It opens SignOutDialog instead of
// signing out immediately — both variants render their own dialog instance
// (simplest correct option; each portals to document.body and only the one
// whose trigger was clicked ever opens).
export function AccountMenu({ variant, onNavigate }: AccountMenuProps) {
  const { data: session, isPending } = authClient.useSession();
  const signOut = useSignOutMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isRail = variant === "rail";

  function handleConfirmSignOut() {
    signOut.mutate(undefined, { onSuccess: () => redirectToMarketing() });
  }

  // No pending guard needed here — SignOutDialog itself won't call this
  // while its mutation is in flight (see its own handleCancel).
  function handleCancelSignOut() {
    setConfirmOpen(false);
  }

  if (isPending || !session) {
    return (
      <div className="flex flex-col">
        <div className={cn("flex items-center", isRail ? "h-16" : "gap-3 px-3 py-3")}>
          <span className={cn("flex shrink-0 items-center justify-center", isRail && "h-16 w-[60px]")}>
            <Skeleton className="h-8 w-8" />
          </span>
          <Skeleton className={cn("h-3 w-24", isRail && "mullion-rail-label")} />
        </div>
        <div className={cn("flex items-center", isRail ? "h-11" : "h-12 gap-3 px-6")}>
          <span className={cn("flex shrink-0 items-center justify-center", isRail && "h-11 w-[60px]")}>
            <Skeleton className="h-4 w-4" />
          </span>
          <Skeleton className={cn("h-3 w-16", isRail && "mullion-rail-label")} />
        </div>
      </div>
    );
  }

  const email = session.user.email;
  const rawName = (session.user.name ?? "").trim();
  const displayName = resolveDisplayName(session.user.name ?? "", email);
  const title = rawName ? `${rawName} - ${email}` : email;

  return (
    <div className="flex flex-col">
      {/* Row 1: avatar + name, links to /settings — unchanged from before
          apart from the label content itself (name, falling back to
          email) and the sign-out button that used to live here. */}
      <div className={cn("flex items-center", isRail ? "h-16" : "gap-1 px-2 py-2")}>
        <Link
          href="/settings"
          onClick={() => onNavigate?.()}
          aria-label="Account settings"
          className={cn(
            "transition-swift flex shrink-0 items-center justify-center hover:bg-elevated focus-visible:bg-elevated focus-visible:outline-none",
            isRail ? "h-16 w-[60px]" : "h-11 w-11",
          )}
        >
          <Avatar name={session.user.name ?? ""} email={email} image={session.user.image} />
        </Link>

        <div className={cn("flex min-w-0 flex-1 items-center", isRail && "mullion-rail-label overflow-hidden")}>
          <span className="min-w-0 flex-1 truncate px-1 text-sm text-fg" title={title}>
            {displayName}
          </span>
        </div>
      </div>

      {/* Row 2: sign out — its own full-row hit target below the profile
          row, matching NAV_ITEMS' shape per variant (fixed 60px icon slot +
          fade label on the rail; inline icon + gap-3 px-6 in the drawer)
          rather than the old small icon-only button. */}
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={signOut.isPending}
        aria-label="Sign out"
        className={cn(
          "transition-swift flex items-center text-fg-muted hover:bg-danger-soft hover:text-danger focus-visible:bg-danger-soft focus-visible:text-danger focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45",
          isRail ? "h-11" : "h-12 gap-3 px-6",
        )}
      >
        {isRail ? (
          <>
            <span className="flex h-11 w-[60px] shrink-0 items-center justify-center">
              <SignOutIcon className="h-4 w-4" />
            </span>
            <span className="mullion-rail-label flex-1 overflow-hidden whitespace-nowrap px-1 text-left font-mono text-[11px] uppercase tracking-[0.2em]">
              Sign out
            </span>
          </>
        ) : (
          <>
            <SignOutIcon className="h-4 w-4" />
            <span className="font-mono text-[11px] uppercase tracking-[0.2em]">Sign out</span>
          </>
        )}
      </button>

      <SignOutDialog
        open={confirmOpen}
        pending={signOut.isPending}
        onCancel={handleCancelSignOut}
        onConfirm={handleConfirmSignOut}
      />
    </div>
  );
}
