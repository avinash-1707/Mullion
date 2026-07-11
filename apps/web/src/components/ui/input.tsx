import * as React from "react";

import { cn } from "@/lib/utils";

// shadcn input restyled for Mullion's editorial marketing surface: sharp
// corners, hairline ink border on cream, ember focus. Used by the auth
// forms; the dark product surface keeps its own TextField.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 border border-hairline-light bg-transparent px-4 text-base text-ink transition-colors duration-200 outline-none",
        "placeholder:text-ink-faint hover:border-ink-faint",
        "focus-visible:border-ember focus-visible:ring-3 focus-visible:ring-ember/20",
        "aria-invalid:border-ember aria-invalid:ring-3 aria-invalid:ring-ember/20",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
