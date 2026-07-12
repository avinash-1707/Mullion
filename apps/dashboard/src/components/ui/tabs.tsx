"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
}

interface TabListProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  /** Prefixes generated tab/panel ids so multiple Tabs instances on one page never collide. */
  idBase: string;
  className?: string;
}

// role=tablist with roving focus (WAI-ARIA APG tabs pattern, automatic
// activation — arrow keys both move focus and switch the panel). Active
// tab reads as an accent bottom-border: the horizontal translation of
// AppSidebar's vertical left-bar active treatment (app-sidebar.tsx,
// `.mullion-rail` rows), same mono-uppercase label recipe as every other
// section label in the product. Horizontally scrollable rather than
// wrapping or shrinking at narrow widths, so this still reads as a single
// row on mobile instead of reflowing into a stack.
export function TabList({ items, value, onChange, idBase, className = "" }: TabListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function focusTabAt(index: number) {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = items.findIndex((item) => item.value === value);
    if (currentIndex === -1) return;

    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % items.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + items.length) % items.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const next = items[nextIndex];
    if (!next) return;
    onChange(next.value);
    focusTabAt(nextIndex);
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={cn("flex gap-1 overflow-x-auto border-b border-border", className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`${idBase}-tab-${item.value}`}
            aria-selected={active}
            aria-controls={`${idBase}-panel-${item.value}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              "transition-swift relative shrink-0 whitespace-nowrap px-4 py-3 font-mono text-[11px] uppercase tracking-[0.2em]",
              active ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {item.label}
            {active ? <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" /> : null}
          </button>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  value: string;
  activeValue: string;
  idBase: string;
  children: ReactNode;
  className?: string;
}

// Every panel stays mounted regardless of which tab is active — matches
// the MobileNav/SignOutDialog convention of a state-driven visibility
// toggle rather than a conditional unmount, so in-progress panel-local
// state (a half-typed API key, a scrolled analytics chart) survives
// switching tabs and back. `hidden` removes it from layout AND the
// accessibility tree without tearing it down.
export function TabPanel({ value, activeValue, idBase, children, className = "" }: TabPanelProps) {
  const active = value === activeValue;
  return (
    <div
      role="tabpanel"
      id={`${idBase}-panel-${value}`}
      aria-labelledby={`${idBase}-tab-${value}`}
      hidden={!active}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}
