"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { CloseIcon } from "@/components/planning/icons";
import { cn } from "@/lib/utils";
import { useCreateOrgMutation } from "@/hooks/use-organizations";

const CONTENT_ID = "app-content";

// Never fires — client-mountedness never changes once true. Same stable
// module-level identity trick as ConfirmDialog/AvatarUploadModal.
const emptySubscribe = () => () => {};

interface CreateOrgDialogProps {
  open: boolean;
  onClose: () => void;
  /** Fires after the workspace is created AND selected — the drawer uses it
   * to close itself now that the app has switched context. */
  onCreated?: (() => void) | undefined;
}

// Name-a-workspace modal for the sidebar org dropdown. Its own component
// (not a ConfirmDialog variant) for the same reason AvatarUploadModal is:
// the shape is a form submit, not a binary confirm. Mechanics follow
// AvatarUploadModal line-for-line — portal, body-scroll lock, #app-content
// inert, focus in/out, Escape + Tab trap, `mullion-dialog*` animation
// classes — except the trap walks inputs as well as buttons, since the
// name field is the first thing focus should land on.
export function CreateOrgDialog({ open, onClose, onCreated }: CreateOrgDialogProps) {
  const titleId = useId();
  const fieldId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  const selfInertedRef = useRef(false);
  const [name, setName] = useState("");
  const createOrg = useCreateOrgMutation();
  const pending = createOrg.isPending;

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

  // Stale text from a previous open is cleared on the way IN (render-phase
  // adjustment, same pattern as MobileNav's prevPathname — the hooks lint
  // forbids synchronous setState in effects), not on close, so the exit
  // animation never flashes an emptied form.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) setName("");
  }

  // Focus lands on the name field on open (the whole dialog is that one
  // input) and returns to the menu trigger on close; a previous open's
  // error state resets alongside.
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      createOrg.reset();
      panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    } else if (wasOpenRef.current) {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }
    wasOpenRef.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- createOrg.reset is stable; reacting to the mutation object would re-run on every state change
  }, [open]);

  function handleClose() {
    if (pending) return;
    onClose();
  }

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!pending) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>("button, input");
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
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
  }, [open, pending, onClose]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    createOrg.mutate(trimmed, {
      onSuccess: () => {
        onClose();
        onCreated?.();
      },
    });
  }

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
        onClick={handleClose}
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
          onClick={handleClose}
          className="transition-swift absolute right-4 top-4 text-fg-faint hover:text-fg focus-visible:outline-none focus-visible:text-fg disabled:pointer-events-none disabled:opacity-45"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        <h2 id={titleId} className="font-serif text-xl text-fg">
          Create workspace
        </h2>
        <p className="mt-1 text-sm text-fg-muted">You&apos;ll switch to it right away.</p>

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <TextField
            fieldId={fieldId}
            label="Workspace name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme Inc"
            autoComplete="off"
            maxLength={80}
            disabled={pending}
          />

          {createOrg.isError ? (
            <p role="alert" className="text-xs text-danger">
              {createOrg.error?.message ?? "Couldn't create the workspace."}
            </p>
          ) : null}

          <Button type="submit" size="sm" disabled={pending || !name.trim()}>
            {pending ? "Creating…" : "Create workspace"}
          </Button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
