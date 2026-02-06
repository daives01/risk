import { CONTINENT_DISPLAY, TERRITORY_DISPLAY, PLAYER_COLORS, getTerritoriesByContinent } from "@/lib/classic-map-layout";
import type { TerritoryHint } from "@/lib/use-game-controller";
import { cn } from "@/lib/utils";

interface GameBoardProps {
  territories: Record<string, { ownerId: string; armies: number }>;
  hints: Record<string, TerritoryHint>;
  selectedFrom: string | null;
  selectedTo: string | null;
  onTerritoryClick: (tid: string) => void;
}

const continentOrder = ["north-america", "europe", "asia", "south-america", "africa", "australia"];

export function GameBoard({ territories, hints, selectedFrom, selectedTo, onTerritoryClick }: GameBoardProps) {
  const groups = getTerritoriesByContinent();

  return (
    <div className="grid grid-cols-3 gap-3">
      {continentOrder.map(continentId => {
        const continent = CONTINENT_DISPLAY[continentId];
        const tids = groups[continentId] ?? [];
        if (!continent) return null;

        return (
          <div key={continentId} className={cn("rounded-lg border p-2", continent.color)}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {continent.name}
            </h3>
            <div className="flex flex-wrap gap-1">
              {tids.map(tid => {
                const territory = territories[tid];
                const display = TERRITORY_DISPLAY[tid];
                const hint = hints[tid];
                if (!territory || !display) return null;

                const colors = PLAYER_COLORS[territory.ownerId] ?? PLAYER_COLORS.neutral;
                const isSelected = tid === selectedFrom || tid === selectedTo;
                const isSelectable = hint?.selectable ?? false;

                return (
                  <button
                    key={tid}
                    onClick={() => onTerritoryClick(tid)}
                    disabled={!isSelectable}
                    className={cn(
                      "relative flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-all",
                      colors.bg, "text-white", colors.border,
                      isSelectable && "cursor-pointer hover:brightness-110 hover:scale-105",
                      !isSelectable && "opacity-60 cursor-default",
                      isSelected && "ring-2 ring-white ring-offset-1 scale-105",
                      hint?.highlighted && !isSelected && "ring-1 ring-white/50",
                    )}
                  >
                    <span className="truncate max-w-[80px]">{display.name}</span>
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-black/30 px-1 text-[10px] font-bold">
                      {territory.armies}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
