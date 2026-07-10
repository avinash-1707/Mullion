import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "sm";

interface ButtonVariantsOptions {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  className?: string | undefined;
}

const SIZES: Record<ButtonSize, string> = {
  md: "h-11 px-5 text-sm",
  sm: "h-9 px-4 text-[13px]",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-bg hover:bg-accent-strong",
  secondary: "border border-border-strong text-fg hover:border-accent/50 hover:text-accent-strong",
  ghost: "text-fg-muted hover:text-fg",
};

// Shared with plain <Link> CTAs (buttonVariants) so a nav "Get started" link
// and an actual <button> submit look identical without duplicating styles.
export function buttonVariants(options: ButtonVariantsOptions = {}): string {
  const { variant = "primary", size = "md", className = "" } = options;
  return [
    "transition-swift inline-flex items-center justify-center gap-2 rounded-lg font-medium",
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
