"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface SignOutDialogProps {
  open: boolean;
  /** Mirrors the sign-out mutation's isPending — disables both actions and
   * swaps the confirm label while the request is in flight. */
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// Rendered by AccountMenu (both rail and drawer instances mount one each).
// Thin wrapper: sign-out's own copy over the shared ConfirmDialog
// (ui/confirm-dialog.tsx), which now owns the portal/inert/focus-trap
// mechanics this file used to implement directly.
export function SignOutDialog({ open, pending, onCancel, onConfirm }: SignOutDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      pending={pending}
      onCancel={onCancel}
      onConfirm={onConfirm}
      title="Sign out?"
      description={<>You&rsquo;ll be signed out and returned to the marketing site.</>}
      confirmLabel="Sign out"
      pendingLabel="Signing out…"
    />
  );
}
