import { useEffect, useState } from "react";

interface TerritoryTooltipProps {
  territoryName: string;
  playerLabel?: string;
  markerSize: number;
  delayed?: boolean;
  absolutePosition?: { x: number; y: number };
}

export function TerritoryTooltip({
  territoryName,
  playerLabel,
  markerSize,
  delayed,
  absolutePosition,
}: TerritoryTooltipProps) {
  const [visible, setVisible] = useState(!delayed);

  useEffect(() => {
    if (!delayed) return;
    const timer = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(timer);
  }, [delayed]);

  if (!visible) return null;

  const offsetPx = Math.max(8, markerSize * 0.95);

  return (
    <div
      className="pointer-events-none absolute z-30 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/70 bg-background/90 px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm"
      style={{
        left: absolutePosition ? `${absolutePosition.x}px` : "50%",
        top: absolutePosition ? `${absolutePosition.y - offsetPx}px` : `calc(-100% - ${offsetPx}px)`,
        transform: absolutePosition ? "translate(-50%, -100%)" : "translateX(-50%)",
      }}
    >
      <div className="uppercase tracking-wide">{territoryName}</div>
      {playerLabel && (
        <div className="font-normal normal-case tracking-normal text-muted-foreground">
          {playerLabel}
        </div>
      )}
    </div>
  );
}
