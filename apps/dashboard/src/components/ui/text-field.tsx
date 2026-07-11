import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  fieldId: string;
}

// Single-line sibling to Textarea (design-context.md "Forms" names Textarea
// as "the template for any new form primitive") — same surface/border/focus
// treatment so settings forms (name, avatar URL, passwords) read as the
// same family as the idea intake textarea. Square corners, hairline
// border, transparent surface, ember focus.
export function TextField({ label, fieldId, className = "", ...props }: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={fieldId} className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
          {label}
        </label>
      ) : null}
      <input
        id={fieldId}
        className={`transition-swift h-11 border border-border bg-transparent px-3.5 text-sm text-fg placeholder:text-fg-faint hover:border-border-strong focus:border-ember focus:outline-none focus:ring-3 focus:ring-ember/20 ${className}`}
        {...props}
      />
    </div>
  );
}
