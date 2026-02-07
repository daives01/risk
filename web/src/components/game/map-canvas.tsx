import { cn } from "@/lib/utils";

interface GraphMapLike {
  territories: Record<string, { name?: string }>;
}

interface VisualLayout {
  imageWidth: number;
  imageHeight: number;
  territoryAnchors: Record<string, { x: number; y: number }>;
}

interface TerritoryState {
  ownerId: string;
  armies: number;
}

interface MapCanvasProps {
  map: GraphMapLike;
  visual: VisualLayout;
  imageUrl: string | null;
  territories: Record<string, TerritoryState>;
  turnOrder: string[];
  selectedFrom: string | null;
  selectedTo: string | null;
  validFromIds: Set<string>;
  validToIds: Set<string>;
  interactive: boolean;
  onClickTerritory: (territoryId: string) => void;
  getPlayerColor: (playerId: string, turnOrder: string[]) => string;
}

export function MapCanvas({
  map,
  visual,
  imageUrl,
  territories,
  turnOrder,
  selectedFrom,
  selectedTo,
  validFromIds,
  validToIds,
  interactive,
  onClickTerritory,
  getPlayerColor,
}: MapCanvasProps) {
  if (!imageUrl) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Map image is unavailable.
      </div>
    );
  }

  const aspectRatio = `${visual.imageWidth} / ${visual.imageHeight}`;

  return (
    <div className="w-full rounded-lg border bg-card p-2">
      <div className="relative w-full overflow-hidden rounded-md bg-muted" style={{ aspectRatio }}>
        <img src={imageUrl} alt="Risk map" className="h-full w-full object-contain" draggable={false} />

        {Object.entries(map.territories).map(([territoryId, territory]) => {
          const anchor = visual.territoryAnchors[territoryId];
          const territoryState = territories[territoryId];
          if (!anchor || !territoryState) return null;

          const isFrom = selectedFrom === territoryId;
          const isTo = selectedTo === territoryId;
          const isValidFrom = validFromIds.has(territoryId);
          const isValidTo = validToIds.has(territoryId);
          const selectable = interactive && (isValidFrom || isValidTo);

          return (
            <button
              key={territoryId}
              type="button"
              onClick={() => onClickTerritory(territoryId)}
              disabled={!selectable}
              title={territory.name ?? territoryId}
              className={cn(
                "absolute min-w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-2 py-1 text-xs font-bold text-white shadow-sm transition",
                selectable ? "cursor-pointer" : "cursor-default opacity-80",
                isFrom && "ring-2 ring-blue-500",
                isTo && "ring-2 ring-red-500",
              )}
              style={{
                left: `${anchor.x * 100}%`,
                top: `${anchor.y * 100}%`,
                backgroundColor: getPlayerColor(territoryState.ownerId, turnOrder),
                borderColor: isValidFrom
                  ? "#3b82f6"
                  : isValidTo
                    ? "#ef4444"
                    : "rgba(255,255,255,0.6)",
              }}
            >
              {territoryState.armies}
            </button>
          );
        })}
      </div>
    </div>
  );
}
