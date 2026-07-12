import type { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  fieldId: string;
}

// Sibling to TextField for the multi-line inputs Phase 1 needs (idea intake,
// edit prompts, "Other" free text) — same surface/border/focus treatment so
// every input in the product reads as one family. Slight rounding, hairline
// border, transparent surface, per the marketing form recipe
// (design-context.md "Forms") — adapted for the dark product surface. No
// focus ring by design — the border color shift to ember on `:focus` is
// the keyboard/mouse focus affordance.
export function Textarea({ label, fieldId, className = "", ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={fieldId} className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
          {label}
        </label>
      ) : null}
      <textarea
        id={fieldId}
        className={`transition-swift h-auto rounded-md border border-border bg-transparent px-3.5 py-3 text-sm text-fg placeholder:text-fg-faint hover:border-border-strong focus:border-ember focus:outline-none ${className}`}
        {...props}
      />
    </div>
  );
}
