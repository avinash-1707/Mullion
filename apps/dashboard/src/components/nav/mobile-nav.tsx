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

// Full-screen slide-over for viewports below `lg` (see AppSidebar for the
// desktop rail). Always mounted, never conditionally rendered, so it has
// something to transition — visibility is a class + `inert` toggle driven
// entirely by `open` state, never gated on `transitionend`, so a rapid
// open/close can't get stuck mid-animation.
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
        <Link
          href="/"
          className="flex items-center gap-2.5 text-fg transition-swift hover:text-ember focus-visible:text-ember focus-visible:outline-none"
        >
          <MullionMark className="h-6 w-6" />
          <span className="font-serif text-xl tracking-tight">Mullion</span>
        </Link>
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
      </header>

      <div
        id={drawerId}
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        inert={!open || undefined}
        tabIndex={-1}
        className={cn(
          "mullion-drawer fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg lg:hidden",
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
    </>
  );
}
