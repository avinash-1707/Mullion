"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MullionMark } from "@/components/mullion-mark";
import { cn } from "@/lib/utils";
import { AccountMenu } from "./account-menu";
import { OrgDropdown } from "./org-dropdown";
import { NAV_ITEMS, isActive } from "./nav-items";

// Carries each row's position into CSS as `--row-index`, read by the
// label's stagger delay in globals.css (`.mullion-rail-label`).
// React.CSSProperties has a closed type (see its own doc comment in
// @types/react) — extending it locally keeps the object literal typed
// without an `as` cast on the value itself.
interface RailRowStyle extends CSSProperties {
  "--row-index"?: number;
}

// Desktop-only rail (`lg:` and up — see MobileNav for the small-viewport
// equivalent). Expansion is pure CSS (`:hover`/`:has(:focus-visible)` in
// globals.css, `.mullion-rail` / `.mullion-rail-label`) — there is
// deliberately no React state for it, so there's nothing to get out of
// sync with the DOM and no re-render on every mouseenter/mouseleave. The
// rail overlays the page rather than pushing it: RootLayout gives the
// content a permanent `lg:pl-[60px]` sized to this rail's resting width,
// so expanding never reflows anything outside the rail itself.
export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="mullion-rail fixed inset-y-0 left-0 z-40 hidden flex-col overflow-x-hidden border-r border-hairline bg-surface lg:flex">
      <Link
        href="/"
        aria-label="Mullion dashboard"
        className="flex h-16 shrink-0 items-center text-fg transition-swift hover:text-ember focus-visible:text-ember focus-visible:outline-none"
      >
        <span className="flex h-16 w-[60px] shrink-0 items-center justify-center">
          <MullionMark className="h-6 w-6" />
        </span>
        <span className="mullion-rail-label flex-1 overflow-hidden whitespace-nowrap font-serif text-xl tracking-tight">
          Mullion
        </span>
      </Link>

      <OrgDropdown variant="rail" />

      <nav aria-label="Primary" className="flex flex-col">
        {NAV_ITEMS.map((item, index) => {
          const active = isActive(pathname, item);
          const style: RailRowStyle = { "--row-index": index };

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              style={style}
              className={cn(
                "transition-swift relative flex h-11 items-center text-fg-muted hover:bg-elevated hover:text-fg focus-visible:bg-elevated focus-visible:text-fg focus-visible:outline-none",
                active && "bg-accent-soft text-fg",
              )}
            >
              {active ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" /> : null}
              <span className="flex h-11 w-[60px] shrink-0 items-center justify-center">
                <item.Icon className={cn("h-4 w-4", active && "text-accent-strong")} />
              </span>
              <span className="mullion-rail-label flex-1 overflow-hidden whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.2em]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="flex-1" />

      <AccountMenu variant="rail" />
    </aside>
  );
}
