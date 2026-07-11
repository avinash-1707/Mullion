"use client";

import { useState, type KeyboardEvent } from "react";
import { Button } from "../ui/button";

interface EditPromptBarProps {
  disabled: boolean;
  disabledMessage: string | null;
  isSubmitting: boolean;
  onSubmit: (prompt: string) => void;
}

// The one open-ended input during Phase 2 (01 §4.2) — "what would change if
// I said X" answered by just saying X, no separate edit mode to enter.
export function EditPromptBar({ disabled, disabledMessage, isSubmitting, onSubmit }: EditPromptBarProps) {
  const [prompt, setPrompt] = useState("");
  const canSubmit = prompt.trim().length > 0 && !disabled && !isSubmitting;

  function submit() {
    if (!canSubmit) return;
    onSubmit(prompt.trim());
    setPrompt("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  if (disabled && disabledMessage) {
    return (
      <div className="flex items-center justify-center border border-dashed border-border-strong bg-surface px-4 py-3.5 text-xs text-fg-faint">
        {disabledMessage}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2.5 border border-border-strong bg-surface p-2.5">
      <textarea
        rows={1}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={`Change something… e.g. "use Postgres instead of Mongo"`}
        className="transition-swift max-h-32 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none"
      />
      <Button type="button" size="sm" onClick={submit} disabled={!canSubmit}>
        {isSubmitting ? "Sending…" : "Send"}
      </Button>
    </div>
  );
}
