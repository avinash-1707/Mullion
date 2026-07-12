"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronIcon } from "@/components/planning/icons";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Shown as a tooltip on the option row (`title` attribute) — used for "why is this disabled". */
  title?: string;
}

interface SelectProps {
  label?: string;
  fieldId: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

// Sibling to TextField/Textarea — same border/surface/focus recipe
// (design-context.md "Forms") — but a hand-rolled ARIA listbox instead of a
// native <select>, whose browser-painted popup can't be restyled to match
// this surface's dark panels/hairline borders/ember accent. Trigger keeps
// DOM focus for the entire interaction (WAI-ARIA APG "listbox popup"
// pattern): keyboard nav moves `aria-activedescendant` + a local
// `activeIndex`, not real focus, so arrowing through options never bounces
// focus in and out of the button. Prop contract intentionally narrower than
// the native-<select> version this replaces (no SelectHTMLAttributes
// passthrough) — `value`/`onChange` are now plain string in/out rather than
// a ChangeEvent, since there's no underlying <select> element to carry one;
// its one consumer (settings/model-role-row.tsx) adapts accordingly.
export function Select({
  label,
  fieldId,
  options,
  value,
  onChange,
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selected = options.find((option) => option.value === value);

  function firstEnabledIndex(): number {
    return options.findIndex((option) => !option.disabled);
  }

  function lastEnabledIndex(): number {
    for (let index = options.length - 1; index >= 0; index -= 1) {
      if (!options[index]?.disabled) return index;
    }
    return -1;
  }

  // Skips disabled options, wrapping at either end — never gets stuck if
  // `from` itself is out of range or every remaining option is disabled.
  function nextEnabledIndex(from: number, direction: 1 | -1): number {
    let index = from;
    for (let step = 0; step < options.length; step += 1) {
      index = index + direction < 0 ? options.length - 1 : (index + direction) % options.length;
      if (!options[index]?.disabled) return index;
    }
    return from;
  }

  // Where keyboard nav should start from when the popup opens: the current
  // value if it's a real, enabled option, otherwise the first enabled one.
  function startIndex(): number {
    const current = options.findIndex((option) => option.value === value);
    if (current >= 0 && !options[current]?.disabled) return current;
    return firstEnabledIndex();
  }

  function openAt(index: number) {
    setActiveIndex(index);
    setOpen(true);
  }

  function commit(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  // Click-outside closes without forcing focus back — the user clicked
  // elsewhere on purpose, same as a native <select>.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  // Keeps the highlighted row in view as arrow keys move past the visible
  // window of a scrollable popup.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[activeIndex];
    if (node instanceof HTMLElement) node.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) {
          openAt(startIndex());
        } else {
          setActiveIndex((current) => nextEnabledIndex(current, event.key === "ArrowDown" ? 1 : -1));
        }
        break;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        if (!open) openAt(startIndex());
        else commit(activeIndex);
        break;
      }
      case "Home": {
        if (!open) break;
        event.preventDefault();
        setActiveIndex(firstEnabledIndex());
        break;
      }
      case "End": {
        if (!open) break;
        event.preventDefault();
        setActiveIndex(lastEnabledIndex());
        break;
      }
      case "Escape": {
        if (!open) break;
        event.preventDefault();
        setOpen(false);
        break;
      }
      default:
        break;
    }
  }

  // Tab-away closes the popup (mirrors a native <select>'s blur behavior);
  // `relatedTarget` is null for some non-focus blur causes (e.g. the window
  // itself losing focus), so this only fires when focus actually landed
  // somewhere outside the component.
  function handleBlur(event: ReactFocusEvent<HTMLButtonElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && !rootRef.current?.contains(next)) {
      setOpen(false);
    }
  }

  const activeOption = options[activeIndex];

  return (
    <div ref={rootRef} className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={fieldId} className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          id={fieldId}
          disabled={disabled}
          role="combobox"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && activeOption ? `${listboxId}-${activeOption.value}` : undefined}
          onClick={() => (open ? setOpen(false) : openAt(startIndex()))}
          onKeyDown={handleTriggerKeyDown}
          onBlur={handleBlur}
          className={cn(
            "transition-swift flex h-11 w-full items-center justify-between gap-2 rounded-md border border-border bg-transparent px-3.5 text-left text-sm text-fg hover:border-border-strong focus:border-ember focus:outline-none disabled:pointer-events-none disabled:opacity-45",
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? "Select…"}</span>
          <ChevronIcon
            className={cn("h-4 w-4 shrink-0 text-fg-muted transition-swift", open ? "-rotate-90" : "rotate-90")}
          />
        </button>

        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel ?? label}
          inert={!open || undefined}
          className={cn(
            "mullion-select-popup absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-64 origin-top overflow-y-auto rounded-lg border border-hairline bg-elevated p-1 shadow-[0_20px_48px_-12px_rgba(0,0,0,0.6)]",
            open && "mullion-select-open",
          )}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={option.value}
                id={`${listboxId}-${option.value}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                title={option.title}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onClick={() => commit(index)}
                className={cn(
                  "transition-swift flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm",
                  option.disabled ? "pointer-events-none opacity-45" : "cursor-pointer",
                  isActive && !option.disabled && "bg-accent-soft",
                  isSelected ? "text-accent-strong" : "text-fg",
                )}
              >
                <span className="truncate">{option.label}</span>
                {isSelected ? <CheckIcon className="h-3.5 w-3.5 shrink-0 text-accent-strong" /> : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
