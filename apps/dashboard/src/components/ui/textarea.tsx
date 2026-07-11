import type { TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  fieldId: string;
}

// Sibling to TextField for the multi-line inputs Phase 1 needs (idea intake,
// edit prompts, "Other" free text) — same surface/border/focus treatment so
// every input in the product reads as one family. Square corners, hairline
// border, transparent surface and ember focus per the marketing form recipe
// (design-context.md "Forms") — adapted for the dark product surface.
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
        className={`transition-swift h-auto border border-border bg-transparent px-3.5 py-3 text-sm text-fg placeholder:text-fg-faint hover:border-border-strong focus:border-ember focus:outline-none focus:ring-3 focus:ring-ember/20 ${className}`}
        {...props}
      />
    </div>
  );
}
