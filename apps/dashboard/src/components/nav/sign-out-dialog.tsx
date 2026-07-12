"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SignOutDialogProps {
  open: boolean;
  /** Mirrors the sign-out mutation's isPending — disables both actions and
   * swaps the confirm label while the request is in flight. */
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const CONTENT_ID = "app-content";

// Never fires — client-mountedness never changes once true. Stable
// module-level identity keeps useSyncExternalStore from resubscribing.
const emptySubscribe = () => () => {};

// Confirms the one destructive, infrequent action in this shell before it
// fires. Always mounted (never conditionally rendered) so open/close is a
// class + `inert` toggle driven entirely by `open` — state-driven like
// MobileNav, never gated on `transitionend`, so a rapid open/close can't get
// stuck mid-animation.
//
// Rendered by AccountMenu (both rail and drawer instances mount one each) and
// portaled to `document.body` rather than left in place: the rail transitions
// `width`/`box-shadow` and the drawer transitions `transform: translateX`
// (globals.css `.mullion-rail` / `.mullion-drawer`) — a transformed ancestor
// turns `position: fixed` relative to itself instead of the viewport, so a
// dialog rendered inside either would anchor to the wrong box. Portaling out
// to `document.body` sidesteps that entirely.
export function SignOutDialog({ open, pending, onCancel, onConfirm }: SignOutDialogProps) {
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

  // #app-content inert while open — except when opened from the mobile
  // drawer, which already inerted it for its own reasons (drawer still open
  // behind this dialog). In that case, do nothing on mount *or* unmount: if
  // this dialog removed the attribute on close, it would resurrect content
  // the drawer still wants inert. `selfInertedRef` is how each side knows
  // which effect owns the attribute.
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
  // — a sign-out in flight can't be backed out of from under itself.
  function handleCancel() {
    if (pending) return;
    onCancel();
  }

  // Escape closes, and Tab is trapped to the panel's two buttons. The trap
  // matters here specifically because of the portal (see the component
  // comment): this dialog is a DOM sibling of whichever rail/drawer rendered
  // its trigger, not a descendant, so without it Tab could walk out of the
  // dialog into that nav's other links. Escape is registered on the capture
  // phase and stops propagation there, before MobileNav's own bubble-phase
  // Escape listener can see it — otherwise, opening this dialog from the
  // mobile drawer would close both on one keypress.
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Always stop here, even while pending: otherwise this would also
        // leak into MobileNav's own bubble-phase Escape listener and close
        // the drawer underneath, whether or not the dialog itself closes.
        // Same guard as handleCancel, inlined so the effect's dependency
        // list stays exact ([open, pending, onCancel]).
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
        className="mullion-dialog-panel relative w-full max-w-sm border border-hairline bg-surface p-6 shadow-[0_20px_48px_-12px_rgba(0,0,0,0.6)]"
      >
        <h2 id={titleId} className="font-serif text-xl text-fg">
          Sign out?
        </h2>
        <p className="mt-2 text-sm text-fg-muted">You&rsquo;ll be signed out and returned to the marketing site.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
