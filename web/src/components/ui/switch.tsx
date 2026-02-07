import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 items-center border border-border/80 bg-background p-0.5 transition-colors",
        "data-[state=checked]:border-primary/70 data-[state=checked]:bg-primary/20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-3.5 bg-muted-foreground transition-transform",
          "data-[state=checked]:translate-x-4 data-[state=checked]:bg-primary",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
