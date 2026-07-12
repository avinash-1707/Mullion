import type { SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Shown as a native tooltip — used for "why is this disabled". */
  title?: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  fieldId: string;
  options: SelectOption[];
}

// Sibling to TextField/Textarea — same border/surface/focus recipe
// (design-context.md "Forms") so a <select> in this product reads as the
// same input family, not a bare unstyled browser control.
export function Select({ label, fieldId, options, className = "", ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label htmlFor={fieldId} className="font-mono text-[11px] uppercase tracking-[0.2em] text-fg-muted">
          {label}
        </label>
      ) : null}
      <select
        id={fieldId}
        className={`transition-swift h-11 border border-border bg-transparent px-3.5 text-sm text-fg hover:border-border-strong focus:border-ember focus:outline-none focus:ring-3 focus:ring-ember/20 disabled:pointer-events-none disabled:opacity-45 ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            title={option.title}
            className="bg-surface text-fg"
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
