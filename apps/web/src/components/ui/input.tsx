import * as React from "react";

import { cn } from "@/lib/utils";

// shadcn input restyled for Mullion's editorial marketing surface: slight
// rounding, hairline ink border on cream, ember focus. Used by the auth
// forms; the dark product surface keeps its own TextField. Focus is a
// border-color shift only (no ring/outline, per user preference) — still a
// visible, non-mouse-suppressed keyboard affordance since it rides
// `:focus-visible`.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-md border border-hairline-light bg-transparent px-4 text-base text-ink transition-colors duration-200 outline-none",
        "placeholder:text-ink-faint hover:border-ink-faint",
        "focus-visible:border-ember",
        "aria-invalid:border-ember",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
