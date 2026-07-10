import type { InputHTMLAttributes } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  fieldId: string;
}

export function TextField({ label, fieldId, className = "", ...props }: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-xs font-medium text-fg-muted">
        {label}
      </label>
      <input
        id={fieldId}
        className={`transition-swift h-11 rounded-lg border border-border-strong bg-elevated px-3.5 text-sm text-fg placeholder:text-fg-faint hover:border-fg-faint focus:border-accent ${className}`}
        {...props}
      />
    </div>
  );
}
