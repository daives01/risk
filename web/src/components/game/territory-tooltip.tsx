import { useEffect, useState } from "react";

interface TerritoryTooltipProps {
  territoryName: string;
  playerLabel?: string;
  markerSize: number;
  delayed?: boolean;
}

export function TerritoryTooltip({ territoryName, playerLabel, markerSize, delayed }: TerritoryTooltipProps) {
  const [visible, setVisible] = useState(!delayed);

  useEffect(() => {
    if (!delayed) return;
    const timer = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(timer);
  }, [delayed]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/70 bg-background/90 px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm"
      style={{
        top: `calc(-100% - ${markerSize * 0.6}px)`,
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
