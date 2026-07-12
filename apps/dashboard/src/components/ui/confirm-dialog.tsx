"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  /** Disables both actions and swaps the confirm label while the guarded action is in flight. */
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Confirm button's label while `pending` is true, e.g. "Removing…". */
  pendingLabel: string;
  cancelLabel?: string;
  /** @default "danger" — every caller so far confirms a destructive action; override for a non-destructive confirm. */
  confirmVariant?: ButtonVariant;
}

const CONTENT_ID = "app-content";

// Never fires — client-mountedness never changes once true. Stable
// module-level identity keeps useSyncExternalStore from resubscribing.
const emptySubscribe = () => () => {};

// Generic confirm/cancel modal, extracted from what was originally a
// sign-out-only dialog (nav/sign-out-dialog.tsx now just supplies copy to
// this). Always mounted (never conditionally rendered) so open/close is a
// class + `inert` toggle driven entirely by `open` — state-driven like
// MobileNav, never gated on `transitionend`, so a rapid open/close can't
// get stuck mid-animation.
//
// Portaled to `document.body` rather than left in place: a caller mounted
// under a transformed ancestor (the nav rail's `width` transition, the
// mobile drawer's `translateX`, globals.css `.mullion-rail` / `.mullion-
// drawer`) would turn this dialog's `position: fixed` relative to that
// ancestor instead of the viewport. Portaling out sidesteps that for every
// call site, not just the nav's.
export function ConfirmDialog({
  open,
  pending,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  confirmVariant = "danger",
}: ConfirmDialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  // Only set when *this* dialog is the one that inerted #app-content — see
  // the effect below for why that distinction matters.
  const selfInertedRef = useRef(false);

  // `createPortal` needs `document.body`, which doesn't exist during SSR —
  // this app renders every route server-first (`dynamic = "force-dynamic"`
  // in layout.tsx). useSyncExternalStore's server/client snapshot split is
  // the render-safe way to express "has the client mounted" without a
  // setState-in-effect: false during SSR + hydration, true on the client's
  // post-hydration render.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  // Body scroll lock while open, restored on close or unmount (same
  // mechanism as MobileNav).
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // #app-content inert while open — except when a caller opened this from
  // behind something that already inerted it for its own reasons (e.g. the
  // mobile drawer). In that case, do nothing on mount *or* unmount: if this
  // dialog removed the attribute on close, it would resurrect content the
  // other surface still wants inert. `selfInertedRef` is how each side
  // knows which effect owns the attribute.
  useEffect(() => {
    if (!open) return;
    const content = document.getElementById(CONTENT_ID);
    if (!content || content.hasAttribute("inert")) return;
    content.setAttribute("inert", "");
    selfInertedRef.current = true;
    return () => {
      if (selfInertedRef.current) {
        content.removeAttribute("inert");
        selfInertedRef.current = false;
      }
    };
  }, [open]);

  // Focus moves into the dialog on open (Cancel, the first button in DOM
  // order — a safe default for a destructive confirmation) and returns to
  // whatever triggered it on close.
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    } else if (wasOpenRef.current) {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }
    wasOpenRef.current = open;
  }, [open]);

  // Closing (scrim click, Cancel, Escape) all route through this one guard
  // — the guarded action can't be backed out of from under itself while in
  // flight.
  function handleCancel() {
    if (pending) return;
    onCancel();
  }

  // Escape closes, and Tab is trapped to the panel's two buttons. The trap
  // matters here specifically because of the portal (see the component
  // comment): this dialog is a DOM sibling of whatever rendered its
  // trigger, not a descendant, so without it Tab could walk out of the
  // dialog into unrelated page chrome. Escape is registered on the capture
  // phase and stops propagation there, before something like MobileNav's
  // own bubble-phase Escape listener can see it — otherwise, opening this
  // dialog from inside another dismissible surface would close both on one
  // keypress.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!pending) onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = panelRef.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons || buttons.length === 0) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, pending, onCancel]);

  if (!mounted) return null;

  return createPortal(
    <div
      inert={!open || undefined}
      className={cn(
        "mullion-dialog fixed inset-0 z-[60] flex items-center justify-center p-4",
        open ? "mullion-dialog-open" : "pointer-events-none",
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Dismiss"
        onClick={handleCancel}
        className="mullion-dialog-scrim absolute inset-0 bg-bg/70 backdrop-blur-sm"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="mullion-dialog-panel relative w-full max-w-sm rounded-lg border border-hairline bg-surface p-6 shadow-[0_20px_48px_-12px_rgba(0,0,0,0.6)]"
      >
        <h2 id={titleId} className="font-serif text-xl text-fg">
          {title}
        </h2>
        <div className="mt-2 text-sm text-fg-muted">{description}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={confirmVariant} size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
