import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

interface ButtonVariantsOptions {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  className?: string | undefined;
}

const SIZES: Record<ButtonSize, string> = {
  md: "h-11 px-5 text-xs",
  sm: "h-9 px-4 text-[11px]",
};

// Brand buttons read as mono uppercase labels (marketing recipe), square
// corners throughout — see design-context.md "Buttons". `danger` follows the
// same solid-then-intensify shape as `primary`, just on the danger tokens —
// for destructive confirmations (e.g. the sign-out dialog), never a one-off
// className hack per call site.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-fg hover:bg-accent-strong",
  secondary: "border border-border-strong bg-transparent text-fg hover:border-accent hover:text-accent-strong",
  ghost: "text-fg-muted hover:text-fg",
  danger: "bg-danger-soft text-danger hover:bg-danger hover:text-fg",
};

// Shared with plain <Link> CTAs (buttonVariants) so a nav "Get started" link
// and an actual <button> submit look identical without duplicating styles.
export function buttonVariants(options: ButtonVariantsOptions = {}): string {
  const { variant = "primary", size = "md", className = "" } = options;
  return [
    "transition-swift inline-flex items-center justify-center gap-2 font-mono uppercase tracking-[0.2em]",
    "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
    SIZES[size],
    VARIANTS[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant, size, className, ...props }: ButtonProps) {
  return <button className={buttonVariants({ variant, size, className })} {...props} />;
}
