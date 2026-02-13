import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function HelpPopover({
  content,
  ariaLabel = "Show help",
  className,
}: {
  content: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={ariaLabel}
        >
          <CircleHelp className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={className ?? "w-80 p-3 text-sm leading-relaxed"}>
        {content}
      </PopoverContent>
    </Popover>
  );
}
