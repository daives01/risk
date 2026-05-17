import type { SyntheticEvent } from "react";

interface HistoryScrubberProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}

export function HistoryScrubber({ min, max, value, onChange }: HistoryScrubberProps) {
  const range = Math.max(1, max - min);
  const clamped = Math.max(min, Math.min(max, value));
  const progress = ((clamped - min) / range) * 100;
  const handleInputEnd = (event: SyntheticEvent<HTMLInputElement>) => {
    event.currentTarget.blur();
  };

  return (
    <label className="flex min-w-[180px] items-center gap-2 text-xs text-muted-foreground">
      <span className="hidden uppercase tracking-wide sm:inline">Timeline</span>
      <div className="relative h-5 w-full">
        <div
          className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full border border-border/70 bg-muted/70"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary/80"
          style={{ width: `${progress}%` }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute top-1/2 z-10 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/80 bg-background shadow-[0_0_0_2px_rgba(11,13,16,0.95)]"
          style={{ left: `${progress}%` }}
          aria-hidden="true"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={clamped}
          onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || min)}
          onPointerUp={handleInputEnd}
          onTouchEnd={handleInputEnd}
          className="absolute inset-0 z-20 h-5 w-full cursor-pointer opacity-0"
          aria-label="Replay timeline frame"
        />
      </div>
    </label>
  );
}
