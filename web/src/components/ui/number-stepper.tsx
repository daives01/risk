import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NumberStepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
  size?: "xs" | "sm";
}

export function NumberStepper({
  value,
  min,
  max,
  onChange,
  disabled = false,
  className,
  size = "sm",
}: NumberStepperProps) {
  const clampedValue = Math.max(min, Math.min(max, value));
  const buttonSize = size === "xs" ? "xs" : "sm";
  const valueClassName =
    size === "xs"
      ? "inline-flex h-6 min-w-8 items-center justify-center border bg-background/80 px-2 text-xs font-semibold"
      : "inline-flex h-8 min-w-10 items-center justify-center border bg-background/80 px-2 text-sm font-semibold";

  return (
    <div className={cn("flex items-center gap-1.5 whitespace-nowrap", className)}>
      <Button
        type="button"
        size={buttonSize}
        variant="outline"
        disabled={disabled || clampedValue <= min}
        onClick={() => onChange(Math.max(min, clampedValue - 1))}
      >
        -
      </Button>
      <span className={valueClassName}>{clampedValue}</span>
      <Button
        type="button"
        size={buttonSize}
        variant="outline"
        disabled={disabled || clampedValue >= max}
        onClick={() => onChange(Math.min(max, clampedValue + 1))}
      >
        +
      </Button>
    </div>
  );
}
