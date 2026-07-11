"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";

// shadcn checkbox restyled for Mullion's editorial marketing surface:
// hairline ink border, fills ember when checked.
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[2px] border border-ink/30 bg-transparent transition-colors duration-200 outline-none",
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "focus-visible:border-ember focus-visible:ring-3 focus-visible:ring-ember/20",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:border-ember data-[state=checked]:bg-ember data-[state=checked]:text-cream",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
