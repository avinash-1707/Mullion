"use client";

import { useState, type FormEvent } from "react";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSaveByokMutation, useRemoveByokMutation } from "@/hooks/use-byok-mutations";
import { FormNote } from "./form-note";
import type { ByokStatus } from "@/lib/settings-api";

interface ByokKeyCardProps {
  status: ByokStatus;
}

// Three states: empty (no key on file — entry form only), saved (masked
// row + Replace/Remove), and entry-over-saved (Replace clicked, or a save
// attempt failed and the form is still open). `editing` is the single
// source of truth for which one renders. The `prevHasKey` comparison below
// is a render-phase state adjustment, not an effect — same pattern
// MobileNav uses for its route-change close (React re-renders immediately
// before painting, and the hooks lint forbids synchronous setState in
// effects) — so `editing` re-syncs the instant `hasKey` actually flips
// (first save, or a remove) without an extra render pass. The mutations'
// own onSuccess handlers additionally flip it immediately, ahead of the
// refetch this comparison would otherwise wait on, for a snappier
// transition.
export function ByokKeyCard({ status }: ByokKeyCardProps) {
  const [editing, setEditing] = useState(!status.hasKey);
  const [prevHasKey, setPrevHasKey] = useState(status.hasKey);
  const [apiKey, setApiKey] = useState("");
  const [removeOpen, setRemoveOpen] = useState(false);
  const saveKey = useSaveByokMutation();
  const removeKey = useRemoveByokMutation();

  if (prevHasKey !== status.hasKey) {
    setPrevHasKey(status.hasKey);
    setEditing(!status.hasKey);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed || saveKey.isPending) return;
    saveKey.mutate(trimmed, {
      onSuccess: () => {
        setApiKey("");
        setEditing(false);
      },
    });
  }

  function handleCancelEdit() {
    setApiKey("");
    saveKey.reset();
    setEditing(false);
  }

  function handleConfirmRemove() {
    removeKey.mutate(undefined, { onSuccess: () => setRemoveOpen(false) });
  }

  return (
    <div className="border border-border p-5">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">OpenRouter API key</h3>

      {editing ? (
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          <TextField
            fieldId="byok-api-key"
            label="API key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-or-v1-…"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="font-mono"
          />
          {saveKey.error ? <FormNote>{saveKey.error.message}</FormNote> : null}
          <div className="flex justify-end gap-2">
            {status.hasKey ? (
              <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={!apiKey.trim() || saveKey.isPending}>
              {saveKey.isPending ? "Validating…" : "Save key"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="font-mono text-sm text-fg">••••{status.keyLast4}</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Replace
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveOpen(true)}>
              Remove
            </Button>
          </div>
        </div>
      )}

      {removeKey.error ? (
        <div className="mt-3">
          <FormNote>{removeKey.error.message}</FormNote>
        </div>
      ) : null}

      <ConfirmDialog
        open={removeOpen}
        pending={removeKey.isPending}
        onCancel={() => setRemoveOpen(false)}
        onConfirm={handleConfirmRemove}
        title="Remove API key?"
        description="Every role currently using your key reverts to the platform default model. This can't be undone."
        confirmLabel="Remove key"
        pendingLabel="Removing…"
      />
    </div>
  );
}
