import { cn } from "@/lib/utils";
import { useMapPanZoom } from "@/lib/use-map-pan-zoom";

interface GraphMapLike {
  territories: Record<string, { name?: string }>;
  adjacency?: Record<string, readonly string[]>;
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
  const panZoom = useMapPanZoom({ minScale: 1, maxScale: 5, zoomStep: 0.25 });

  const graphEdges = Object.entries(map.adjacency ?? {}).flatMap(([from, neighbors]) =>
    neighbors
      .filter((to) => from < to)
      .map((to) => ({ from, to })),
  );

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
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>Pinch or wheel to zoom. Drag to pan.</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={panZoom.zoomOut}
            className="rounded border px-2 py-1 transition hover:bg-muted"
          >
            -
          </button>
          <span className="w-12 text-center">{Math.round(panZoom.scale * 100)}%</span>
          <button
            type="button"
            onClick={panZoom.zoomIn}
            className="rounded border px-2 py-1 transition hover:bg-muted"
          >
            +
          </button>
          <button
            type="button"
            onClick={panZoom.reset}
            className="rounded border px-2 py-1 transition hover:bg-muted"
          >
            Reset
          </button>
        </div>
      </div>

      <div
        ref={panZoom.containerRef}
        className="relative w-full overflow-hidden rounded-md bg-muted touch-none"
        style={{ aspectRatio }}
        {...panZoom.handlers}
      >
        <div className="relative h-full w-full" style={panZoom.transformStyle}>
          <img src={imageUrl} alt="Risk map" className="h-full w-full object-contain" draggable={false} />

          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {graphEdges.map(({ from, to }) => {
              const fromAnchor = visual.territoryAnchors[from];
              const toAnchor = visual.territoryAnchors[to];
              if (!fromAnchor || !toAnchor) return null;

              const touchesFrom = selectedFrom === from || selectedFrom === to;
              const touchesTo = selectedTo === from || selectedTo === to;
              const isCandidate =
                !!selectedFrom &&
                ((from === selectedFrom && validToIds.has(to)) || (to === selectedFrom && validToIds.has(from)));

              return (
                <line
                  key={`${from}-${to}`}
                  x1={`${fromAnchor.x * 100}%`}
                  y1={`${fromAnchor.y * 100}%`}
                  x2={`${toAnchor.x * 100}%`}
                  y2={`${toAnchor.y * 100}%`}
                  stroke={touchesTo ? "rgba(248,113,113,0.95)" : touchesFrom || isCandidate ? "rgba(96,165,250,0.95)" : "rgba(255,255,255,0.24)"}
                  strokeWidth={touchesFrom || touchesTo || isCandidate ? 3 : 1.5}
                />
              );
            })}
          </svg>

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
                onPointerDown={(event) => event.stopPropagation()}
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
    </div>
  );
}
