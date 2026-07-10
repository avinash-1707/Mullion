import type { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  fieldId: string;
}

// Sibling to TextField for the multi-line inputs Phase 1 needs (idea intake,
// edit prompts, "Other" free text) — same surface/border/focus treatment so
// every input in the product reads as one family.
export function Textarea({ label, fieldId, className = "", ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={fieldId} className="text-xs font-medium text-fg-muted">
          {label}
        </label>
      ) : null}
      <textarea
        id={fieldId}
        className={`transition-swift rounded-lg border border-border-strong bg-elevated px-3.5 py-3 text-sm text-fg placeholder:text-fg-faint hover:border-fg-faint focus:border-accent ${className}`}
        {...props}
      />
    </div>
  );
}
