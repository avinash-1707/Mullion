"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MullionMark } from "@/components/mullion-mark";
import { cn } from "@/lib/utils";
import { CloseIcon, MenuIcon } from "@/components/planning/icons";
import { AccountMenu } from "./account-menu";
import { OrgDropdown } from "./org-dropdown";
import { NAV_ITEMS, isActive } from "./nav-items";

// Set once on the shell's <main> in RootLayout — the only thing this
// component and the page content need to agree on, since the drawer
// lives outside that subtree and can only reach it by id.
const CONTENT_ID = "app-content";

// Slide-over drawer (~70% viewport width, capped at max-w-sm) for
// viewports below `lg` (see AppSidebar for the desktop rail) — not
// full-screen: the remaining strip stays visible through a blurred scrim,
// which is itself a tap target that closes the drawer. Always mounted,
// never conditionally rendered, so it has something to transition —
// visibility is a class + `inert` toggle driven entirely by `open` state,
// never gated on `transitionend`, so a rapid open/close can't get stuck
// mid-animation.
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wasOpenRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerId = useId();

  // Route change closes the drawer — covers "navigated via the drawer"
  // for every case except tapping the link for the route already active,
  // which the per-link onClick below handles directly. Render-phase
  // adjustment (not an effect): React re-renders immediately before
  // painting, and the hooks lint forbids synchronous setState in effects.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  // Crossing into `lg` while open would otherwise strand #app-content
  // (and this header) inert forever — the inert effect below only
  // re-runs when `open` changes, and AppSidebar's rail takes over in the
  // same resize, so the drawer no longer needs to be open at all.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    function handleChange(event: MediaQueryListEvent) {
      if (event.matches) setOpen(false);
    }
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  // Body scroll lock while open, restored on close or unmount.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // `inert` (not aria-hidden, not display:none) on whichever side isn't
  // the current interactive surface. The drawer's own inert is declarative
  // (see the `inert` prop below) so its off-screen links are out of the
  // tab order from the SSR payload onward, not just after hydration; only
  // the page content and header — outside this subtree — need the effect.
  useEffect(() => {
    const content = document.getElementById(CONTENT_ID);
    const header = headerRef.current;

    if (open) {
      content?.setAttribute("inert", "");
      header?.setAttribute("inert", "");
    } else {
      content?.removeAttribute("inert");
      header?.removeAttribute("inert");
    }

    return () => {
      content?.removeAttribute("inert");
      header?.removeAttribute("inert");
    };
  }, [open]);

  // Escape closes; focus moves into the drawer on open.
  useEffect(() => {
    if (!open) return;
    drawerRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Focus returns to the hamburger only on a genuine open -> closed
  // transition, never on mount (which would steal focus on page load).
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      triggerRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-hairline bg-bg/85 px-6 backdrop-blur-sm lg:hidden"
      >
        {/* Trigger leads the header (left side) — the drawer it opens is
            anchored to, and slides in from, that same left edge below. */}
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls={drawerId}
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen((value) => !value)}
          className="transition-swift flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-elevated hover:text-fg focus-visible:bg-elevated focus-visible:text-fg focus-visible:outline-none"
        >
          {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
        <Link
          href="/"
          className="flex items-center gap-2.5 text-fg transition-swift hover:text-ember focus-visible:text-ember focus-visible:outline-none"
        >
          <MullionMark className="h-6 w-6" />
          <span className="font-serif text-xl tracking-tight">Mullion</span>
        </Link>
      </header>

      {/* Outer layer: full-viewport, but only ever a click/focus target via
          its two children below — the wrapper itself carries no visible
          fill. `inert` lives here (once) rather than duplicated on the
          scrim and panel individually, same convention as
          ui/confirm-dialog.tsx's root wrapper. */}
      <div
        className={cn("fixed inset-0 z-50 lg:hidden", open ? "" : "pointer-events-none")}
        inert={!open || undefined}
      >
        {/* Scrim over the ~30% strip the panel doesn't cover — tapping it
            closes, same bg-bg/70 + backdrop-blur-sm language as
            ui/confirm-dialog.tsx's scrim, timed to match this drawer's own
            asymmetric slide (see .mullion-drawer-scrim, globals.css)
            instead of reusing the dialog's timing. */}
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className={cn(
            "mullion-drawer-scrim absolute inset-0 bg-bg/70 backdrop-blur-sm",
            open && "mullion-drawer-open",
          )}
        />

        <div
          id={drawerId}
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          tabIndex={-1}
          className={cn(
            "mullion-drawer absolute inset-y-0 left-0 flex w-[70%] max-w-sm flex-col overflow-y-auto border-r border-hairline bg-bg",
            open && "mullion-drawer-open",
          )}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-hairline px-6">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 text-fg transition-swift hover:text-ember focus-visible:text-ember focus-visible:outline-none"
            >
              <MullionMark className="h-6 w-6" />
              <span className="font-serif text-xl tracking-tight">Mullion</span>
            </Link>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
              className="transition-swift flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-elevated hover:text-fg focus-visible:bg-elevated focus-visible:text-fg focus-visible:outline-none"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <OrgDropdown variant="drawer" onNavigate={() => setOpen(false)} />

          <nav aria-label="Primary" className="flex flex-col">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "transition-swift relative flex h-12 items-center gap-3 px-6 text-fg-muted hover:bg-elevated hover:text-fg focus-visible:bg-elevated focus-visible:text-fg focus-visible:outline-none",
                    active && "bg-accent-soft text-fg",
                  )}
                >
                  {active ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" /> : null}
                  <item.Icon className={cn("h-4 w-4", active && "text-accent-strong")} />
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em]">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />

          <div className="border-t border-hairline pb-[env(safe-area-inset-bottom)]">
            <AccountMenu variant="drawer" onNavigate={() => setOpen(false)} />
          </div>
        </div>
      </div>
    </>
  );
}
