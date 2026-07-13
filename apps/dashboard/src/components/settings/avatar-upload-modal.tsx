"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CameraIcon, CloseIcon, TrashIcon } from "@/components/planning/icons";
import { cn } from "@/lib/utils";
import { FormNote } from "./form-note";

interface AvatarUploadModalProps {
  open: boolean;
  /** uploadPending || removePending — blocks every close path, mirrors ConfirmDialog's `pending`. */
  pending: boolean;
  uploading: boolean;
  removing: boolean;
  hasImage: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onUploadClick: () => void;
  onRemove: () => void;
  name: string;
  email: string;
  image?: string | null | undefined;
}

const CONTENT_ID = "app-content";

// Never fires — client-mountedness never changes once true. Same stable
// module-level identity trick as ConfirmDialog, for the same reason: keeps
// useSyncExternalStore from resubscribing.
const emptySubscribe = () => () => {};

// Options modal for the avatar trigger — deliberately its own component
// rather than a new ConfirmDialog `variant`, because the shape here isn't a
// binary confirm/cancel: it offers two independent actions (upload, remove)
// plus a live preview, and ConfirmDialog's contract (title/description/one
// confirm button) doesn't stretch to that without turning it into something
// else. Follows ConfirmDialog's mechanics line-for-line (portal, body-scroll
// lock, #app-content inert, focus in/out, Escape+Tab trap, the
// `mullion-dialog*` animation classes) so it reads as the same primitive
// everywhere else in the app already recognizes, without editing
// confirm-dialog.tsx itself or touching its other call sites.
export function AvatarUploadModal({
  open,
  pending,
  uploading,
  removing,
  hasImage,
  errorMessage,
  onCancel,
  onUploadClick,
  onRemove,
  name,
  email,
  image,
}: AvatarUploadModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const selfInertedRef = useRef(false);

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

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

  // Focus moves to the panel's first button on open (the close affordance —
  // a safe, non-destructive default, same reasoning as ConfirmDialog
  // defaulting to Cancel) and returns to the avatar trigger on close.
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

  function handleCancel() {
    if (pending) return;
    onCancel();
  }

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
        <button
          type="button"
          aria-label="Close"
          disabled={pending}
          onClick={handleCancel}
          className="transition-swift absolute right-4 top-4 text-fg-faint hover:text-fg focus-visible:outline-none focus-visible:text-fg disabled:pointer-events-none disabled:opacity-45"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        <h2 id={titleId} className="font-serif text-xl text-fg">
          Update avatar
        </h2>
        <p className="mt-1 text-sm text-fg-muted">PNG, JPEG, or WebP, up to 5MB.</p>

        <div className="mt-5 flex justify-center">
          <div className="relative h-28 w-28">
            <Avatar name={name} email={email} image={image} className="h-28 w-28" />
            {uploading ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-bg/80">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-fg-faint border-t-ember" />
                <span className="sr-only">Uploading…</span>
              </span>
            ) : null}
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-5">
            <FormNote>{errorMessage}</FormNote>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onUploadClick}>
            <CameraIcon className="h-3.5 w-3.5" />
            {uploading ? "Uploading…" : "Upload new photo"}
          </Button>
          {hasImage ? (
            <Button type="button" variant="danger" size="sm" disabled={pending} onClick={onRemove}>
              <TrashIcon className="h-3.5 w-3.5" />
              {removing ? "Removing…" : "Remove photo"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
