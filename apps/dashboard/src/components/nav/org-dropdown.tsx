"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useOrganizationsList, useActiveOrganizationId, useSetActiveOrgMutation } from "@/hooks/use-organizations";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckIcon, ChevronIcon, PlusIcon, WarningIcon } from "@/components/planning/icons";
import { CreateOrgDialog } from "./create-org-dialog";

interface OrgDropdownProps {
  /** Mirrors AccountMenu's variant contract: `rail` sits in the desktop
   * sidebar's fixed 60px icon slot + hover-fade label region; `drawer` is
   * the mobile slide-over's always-expanded equivalent. */
  variant: "rail" | "drawer";
  /** Drawer closes itself once a new workspace is created and selected
   * (CreateOrgDialog's onCreated); the rail has nothing that needs closing. */
  onNavigate?: () => void;
}

// First letter of the name, uppercased. Mirrors ui/avatar.tsx's
// fallback-to-"?" convention for a blank name.
function orgMonogram(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}

// One square-badge recipe shared by the trigger (h-7) and menu rows (h-5)
// so the two sizes read as the same glyph family rather than two different
// components drifting apart over time.
function OrgMonogramBadge({ name, className }: { name: string; className: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border border-hairline bg-accent-soft font-serif text-accent-strong",
        className,
      )}
    >
      {orgMonogram(name)}
    </span>
  );
}

// Replaces the old OrgSwitcher (a bare reuse of ui/select.tsx). That
// version collapsed to nothing below two orgs and relied on Select's
// fake-focus combobox pattern (aria-activedescendant, trigger keeps DOM
// focus). This one is always visible — even a single-org account still
// needs a path to "Create workspace" — and lifts ui/dropdown-menu.tsx's
// real roving-focus menu-button pattern instead: switching the active org
// is a one-shot commit-and-close action, not a persisted combobox value.
//
// Non-portaled: the popup is a plain descendant of this component (same
// always-mounted, class-toggle-driven `.mullion-select-popup` enter/exit as
// ui/select.tsx), not rendered into document.body — the panel never needs
// to escape the rail/drawer's own stacking context.
export function OrgDropdown({ variant, onNavigate }: OrgDropdownProps) {
  const isRail = variant === "rail";
  const { data: organizations, isPending } = useOrganizationsList();
  const activeOrganizationId = useActiveOrganizationId();
  const setActiveOrg = useSetActiveOrgMutation();

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const initialFocusRef = useRef<"first" | "last">("first");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  function focusItem(index: number) {
    itemRefs.current[index]?.focus();
  }

  function openMenu(initial: "first" | "last") {
    initialFocusRef.current = initial;
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  // The menu's item buttons aren't in the DOM (or focusable) until after
  // this render commits, so the initial item can't be focused inline from
  // the click/keydown handler that flips `open` — mirrors
  // ui/dropdown-menu.tsx's own effect.
  useEffect(() => {
    if (!open || !organizations) return;
    focusItem(initialFocusRef.current === "last" ? organizations.length : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-focus on open/close, not on every organizations identity change
  }, [open]);

  // Outside click closes without forcing focus back — the user clicked
  // elsewhere on purpose, same convention as ui/select.tsx and
  // ui/dropdown-menu.tsx.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  // No loading skeleton flash-then-vanish concern here (unlike the old
  // OrgSwitcher): this component never collapses to null once loaded, so a
  // pending placeholder always resolves into the real row.
  if (isPending || !organizations) {
    return (
      <div className={cn("border-b border-hairline", isRail && "p-2")}>
        <div className={cn("flex items-center", isRail ? "h-11 rounded-md bg-accent-soft/70" : "h-12 gap-3 px-6")}>
          <span className={cn("flex shrink-0 items-center justify-center", isRail && "h-11 w-11")}>
            <Skeleton className="h-7 w-7" />
          </span>
          <Skeleton className={cn("h-3 w-20", isRail && "mullion-rail-label")} />
        </div>
      </div>
    );
  }

  const activeOrg = organizations.find((org) => org.id === activeOrganizationId) ?? organizations[0];
  const label = activeOrg ? activeOrg.name : "";
  const lastItemIndex = organizations.length;

  function handleTriggerClick() {
    if (open) {
      setOpen(false);
    } else {
      openMenu("first");
    }
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        openMenu("first");
        break;
      case "ArrowUp":
        event.preventDefault();
        openMenu("last");
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        openMenu("first");
        break;
      default:
        break;
    }
  }

  // Real roving DOM focus across org rows + the trailing "Create
  // organization" row (index === organizations.length) — every key here
  // fires from an item's own onKeyDown, never from the trigger, since
  // focus has already moved off the trigger by the time a menu is open.
  function handleItemKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const count = lastItemIndex + 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem((index + 1) % count);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem((index - 1 + count) % count);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(lastItemIndex);
        break;
      case "Escape":
        event.preventDefault();
        closeMenu();
        break;
      case "Tab":
        // A menu, not a modal — Tab is a close, never a trap. But letting
        // the default Tab run would land on the next (still-mounted) menu
        // item one tick before `inert` re-applies, and focus would then
        // drop to <body>. Close like Escape instead: deterministic landing
        // on the trigger.
        event.preventDefault();
        closeMenu();
        break;
      default:
        break;
    }
  }

  function commitOrg(organizationId: string) {
    if (organizationId === activeOrganizationId) {
      // No-op reselect: nothing fires, so the trigger stays enabled and can
      // take focus back like any other close.
      closeMenu();
      return;
    }
    setActiveOrg.mutate(organizationId);
    // A real switch disables the trigger on the very next render, and
    // browsers blur an element the moment it becomes disabled — returning
    // focus to it here would just bounce focus to <body> anyway, so close
    // without the refocus rather than pretending it sticks.
    setOpen(false);
  }

  // Menu closes, modal opens — the drawer (if any) stays put until the
  // workspace is actually created and selected; CreateOrgDialog fires
  // onCreated (wired to onNavigate) only on that success.
  function commitCreateOrg() {
    closeMenu();
    setCreateOpen(true);
  }

  return (
    <div className={cn("flex flex-col border-b border-hairline", isRail && "p-2")}>
      <div ref={rootRef} className="relative" data-menu-open={open || undefined}>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          disabled={setActiveOrg.isPending}
          onClick={handleTriggerClick}
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            "transition-swift flex w-full items-center focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45",
            // Rail: inset card — a faint ember fill and rounding against the
            // full-bleed nav rows below, deliberately static on hover (the
            // brand tint IS the identity treatment, not an interactive
            // state; the chevron and cursor carry the affordance). Slot is
            // w-11, not the rail's usual 60px: the p-2 wrapper eats 8px a
            // side, so 44px is what keeps the monogram dead-center at the
            // 60px resting width.
            isRail
              ? "h-11 rounded-md bg-accent-soft/70"
              : "h-12 gap-3 px-6 hover:bg-elevated focus-visible:bg-elevated",
          )}
        >
          <span className={cn("flex shrink-0 items-center justify-center", isRail && "h-11 w-11")}>
            <OrgMonogramBadge name={activeOrg?.name ?? ""} className="h-7 w-7 text-xs" />
          </span>
          <span
            className={cn("flex min-w-0 flex-1 items-center gap-2", isRail && "mullion-rail-label overflow-hidden pr-3")}
          >
            <span className="min-w-0 flex-1 truncate text-left text-sm text-fg">{label}</span>
            <ChevronIcon
              className={cn("h-3.5 w-3.5 shrink-0 text-fg-muted transition-swift", open ? "-rotate-90" : "rotate-90")}
            />
          </span>
        </button>

        <div
          id={menuId}
          role="menu"
          aria-label="Switch workspace"
          inert={!open || undefined}
          className={cn(
            "mullion-select-popup absolute top-[calc(100%+6px)] z-30 max-h-64 origin-top overflow-y-auto rounded-lg border border-hairline bg-elevated p-1 shadow-[0_20px_48px_-12px_rgba(0,0,0,0.6)]",
            // Rail: the p-2 wrapper already insets the anchor 8px a side, so
            // the panel spans it edge-to-edge.
            isRail ? "left-0 right-0" : "left-6 right-6",
            open && "mullion-select-open",
          )}
        >
          {organizations.map((org, index) => {
            const checked = org.id === activeOrganizationId;
            return (
              <button
                key={org.id}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={checked}
                onClick={() => commitOrg(org.id)}
                onKeyDown={(event) => handleItemKeyDown(event, index)}
                className="transition-swift flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-fg hover:bg-accent-soft focus:bg-accent-soft focus:outline-none"
              >
                <OrgMonogramBadge name={org.name} className="h-5 w-5 text-[9px]" />
                <span className="min-w-0 flex-1 truncate">{org.name}</span>
                {checked ? <CheckIcon className="h-3.5 w-3.5 shrink-0 text-accent-strong" /> : null}
              </button>
            );
          })}

          <div aria-hidden="true" className="my-1 border-t border-hairline" />

          <button
            ref={(node) => {
              itemRefs.current[lastItemIndex] = node;
            }}
            type="button"
            role="menuitem"
            onClick={commitCreateOrg}
            onKeyDown={(event) => handleItemKeyDown(event, lastItemIndex)}
            className="transition-swift flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-accent-soft hover:text-fg focus:bg-accent-soft focus:text-fg focus:outline-none"
          >
            <PlusIcon className="h-3.5 w-3.5 shrink-0" />
            Create workspace
          </button>
        </div>
      </div>

      {/* Trigger keeps showing the actual (unswitched) active org above —
          already truthful — so the failure only needs a line of its own,
          not a rewrite of the row. Rail keeps the icon always visible (not
          faded) so a collapsed rail still signals "something's wrong" at a
          glance; only the message text lives in the fade region. */}
      {setActiveOrg.isError ? (
        <div role="alert" className="flex items-center">
          {isRail ? (
            <>
              <span className="flex w-11 shrink-0 items-center justify-center py-2">
                <WarningIcon className="h-3.5 w-3.5 text-danger" />
              </span>
              <span className="mullion-rail-label min-w-0 flex-1 truncate overflow-hidden pr-3 text-xs text-danger">
                {setActiveOrg.error?.message ?? "Couldn't switch organizations."}
              </span>
            </>
          ) : (
            <div className="flex min-w-0 items-center gap-2 px-6 py-2">
              <WarningIcon className="h-3.5 w-3.5 shrink-0 text-danger" />
              <span className="truncate text-xs text-danger">
                {setActiveOrg.error?.message ?? "Couldn't switch organizations."}
              </span>
            </div>
          )}
        </div>
      ) : null}

      <CreateOrgDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={onNavigate} />
    </div>
  );
}
