"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { MoreIcon } from "@/components/planning/icons";

export interface DropdownMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Destructive styling (danger tokens) — see nav/account-menu.tsx's sign-out row for the same hover:bg-danger-soft hover:text-danger pair. */
  destructive?: boolean;
}

interface DropdownMenuProps {
  items: DropdownMenuItem[];
  /** Accessible name for the ellipsis trigger, e.g. "Actions for Jane Doe". */
  triggerLabel: string;
  disabled?: boolean;
  className?: string;
}

// Small anchored action menu (member-row.tsx's trailing ellipsis column is
// the first caller) — the WAI-ARIA menu-button pattern: real roving DOM
// focus across role="menuitem" buttons, deliberately different from
// ui/select.tsx's combobox+listbox (trigger keeps focus,
// aria-activedescendant highlights a row). A menu commits an action and
// closes immediately rather than holding a persisted value, so there's no
// reason to park focus on the trigger while navigating — moving real focus
// into the panel is both simpler here and the more standard pattern for
// role="menu".
//
// Non-portaled, absolutely-positioned panel — same always-mounted,
// class-toggle-driven enter/exit as .mullion-select-popup (globals.css)
// rather than a conditional render, so a fast open/close can't get stuck
// mid-transition. Anchored top-right (not top-left, like Select's popup)
// since this trigger sits at a table row's right edge and the panel must
// never grow off-screen to the right.
export function DropdownMenu({ items, triggerLabel, disabled = false, className = "" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  function firstEnabledIndex(): number {
    return items.findIndex((item) => !item.disabled);
  }

  function lastEnabledIndex(): number {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (!items[index]?.disabled) return index;
    }
    return -1;
  }

  // Skips disabled items, wrapping at either end — mirrors Select's own
  // nextEnabledIndex exactly.
  function nextEnabledIndex(from: number, direction: 1 | -1): number {
    let index = from;
    for (let step = 0; step < items.length; step += 1) {
      index = index + direction < 0 ? items.length - 1 : (index + direction) % items.length;
      if (!items[index]?.disabled) return index;
    }
    return from;
  }

  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function focusItem(index: number) {
    itemRefs.current[index]?.focus();
  }

  // The one bit of imperative focus-management an effect is actually
  // needed for: the menuitem buttons aren't in the DOM (or focusable) until
  // after this render commits, so the first enabled one can't be focused
  // inline in the click/keydown handler that flips `open`.
  useEffect(() => {
    if (open) focusItem(firstEnabledIndex());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-focus on open/close, not on every items identity change
  }, [open]);

  // Outside click closes without forcing focus back — the user clicked
  // elsewhere on purpose, same convention (and reasoning) as ui/select.tsx.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleItemKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(nextEnabledIndex(index, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(nextEnabledIndex(index, -1));
        break;
      case "Home":
        event.preventDefault();
        focusItem(firstEnabledIndex());
        break;
      case "End":
        event.preventDefault();
        focusItem(lastEnabledIndex());
        break;
      case "Escape":
        event.preventDefault();
        closeMenu();
        break;
      case "Tab":
        // A menu, not a modal — tabbing out is a normal close, never trapped.
        setOpen(false);
        break;
      default:
        break;
    }
  }

  function commit(item: DropdownMenuItem) {
    if (item.disabled) return;
    setOpen(false);
    triggerRef.current?.focus();
    item.onSelect();
  }

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        className="transition-swift flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-elevated hover:text-fg focus-visible:bg-elevated focus-visible:text-fg focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45"
      >
        <MoreIcon className="h-4 w-4" />
      </button>

      <div
        id={menuId}
        role="menu"
        aria-label={triggerLabel}
        inert={!open || undefined}
        className={cn(
          "mullion-dropdown-popup absolute right-0 top-[calc(100%+6px)] z-30 min-w-40 origin-top-right rounded-lg border border-hairline bg-elevated p-1 shadow-[0_20px_48px_-12px_rgba(0,0,0,0.6)]",
          open && "mullion-dropdown-open",
        )}
      >
        {items.map((item, index) => (
          <button
            key={item.key}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => commit(item)}
            onKeyDown={(event) => handleItemKeyDown(event, index)}
            className={cn(
              "transition-swift flex w-full items-center rounded-md px-3 py-2 text-left text-sm focus:outline-none disabled:pointer-events-none disabled:opacity-45",
              item.destructive
                ? "text-danger hover:bg-danger-soft focus:bg-danger-soft"
                : "text-fg hover:bg-accent-soft focus:bg-accent-soft",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
