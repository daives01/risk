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

  return (
    <label className="flex min-w-[260px] items-center gap-2 text-xs text-muted-foreground">
      <span className="uppercase tracking-wide">Timeline</span>
      <div className="relative w-full">
        <div
          className="pointer-events-none absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full border border-border/70 bg-muted/70"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary/80"
          style={{ width: `${progress}%` }}
          aria-hidden="true"
        />
        <input
          type="range"
          min={min}
          max={max}
          value={clamped}
          onChange={(event) => onChange(Number.parseInt(event.target.value, 10) || min)}
          className="relative z-10 h-5 w-full appearance-none bg-transparent focus:outline-none
            [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:bg-transparent
            [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:border-0 [&::-moz-range-track]:bg-transparent
            [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-primary/80 [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(11,13,16,0.95)]
            [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-primary/80 [&::-moz-range-thumb]:bg-background [&::-moz-range-thumb]:shadow-[0_0_0_2px_rgba(11,13,16,0.95)]"
          aria-label="Replay timeline frame"
        />
      </div>
    </label>
  );
}
