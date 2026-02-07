import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, LockOpen, Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/number-stepper";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMapPanZoom } from "@/lib/use-map-pan-zoom";
import { isTypingTarget } from "@/lib/keyboard-shortcuts";

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
  highlightedTerritoryIds: Set<string>;
  graphEdgeMode?: "all" | "action" | "none";
  interactive: boolean;
  troopDeltaDurationMs?: number;
  onClickTerritory: (territoryId: string) => void;
  onClearSelection?: () => void;
  getPlayerColor: (playerId: string, turnOrder: string[]) => string;
  battleOverlay?:
    | {
        mode: "attack";
        fromTerritoryId: string;
        toTerritoryId: string;
        fromLabel: string | null;
        toLabel: string | null;
        attackDice: number;
        maxDice: number;
        disabled: boolean;
        onSetAttackDice: (dice: number) => void;
        onResolveAttack: () => void;
        onCancelSelection: () => void;
        onEndAttackPhase: () => void;
      }
    | {
        mode: "occupy";
        fromTerritoryId: string;
        toTerritoryId: string;
        fromLabel: string;
        toLabel: string;
        disabled: boolean;
        occupyMove: number;
        minMove: number;
        maxMove: number;
        onSetOccupyMove: (count: number) => void;
        onSubmitOccupy: () => void;
      }
    | {
        mode: "fortify";
        fromTerritoryId: string;
        toTerritoryId: string;
        fromLabel: string;
        toLabel: string;
        disabled: boolean;
        fortifyCount: number;
        minCount: number;
        maxCount: number;
        onSetFortifyCount: (count: number) => void;
        onSubmitFortify: () => void;
        onCancelSelection: () => void;
      }
    | null;
}

interface FloatingTroopDelta {
  id: string;
  territoryId: string;
  amount: number;
  color: string;
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
  highlightedTerritoryIds,
  graphEdgeMode = "all",
  interactive,
  troopDeltaDurationMs = 1000,
  onClickTerritory,
  onClearSelection,
  getPlayerColor,
  battleOverlay,
}: MapCanvasProps) {
  const [zoomLocked, setZoomLocked] = useState(true);
  const [floatingDeltas, setFloatingDeltas] = useState<FloatingTroopDelta[]>([]);
  const previousTerritoriesRef = useRef<Record<string, TerritoryState> | null>(null);
  const { containerRef, handlers, transformStyle, scale, zoomIn, zoomOut, reset, shouldSuppressClick } = useMapPanZoom({
    minScale: 0.85,
    maxScale: 1.75,
    zoomStep: 0.1,
  });
  const frameAspect = 16 / 9;
  const imageAspect = visual.imageWidth / visual.imageHeight;
  const highlightActive = highlightedTerritoryIds.size > 0;

  const graphEdges = Object.entries(map.adjacency ?? {}).flatMap(([from, neighbors]) =>
    neighbors
      .filter((to) => from < to)
      .map((to) => ({ from, to })),
  );

  const imageFit = useMemo(() => {
    if (imageAspect >= frameAspect) {
      const drawHeight = frameAspect / imageAspect;
      const top = (1 - drawHeight) / 2;
      return { left: 0, top, width: 1, height: drawHeight };
    }
    const drawWidth = imageAspect / frameAspect;
    const left = (1 - drawWidth) / 2;
    return { left, top: 0, width: drawWidth, height: 1 };
  }, [frameAspect, imageAspect]);

  const projectedAnchors = useMemo(() => {
    const result: Record<string, { x: number; y: number }> = {};
    for (const [territoryId, anchor] of Object.entries(visual.territoryAnchors)) {
      result[territoryId] = {
        x: imageFit.left + anchor.x * imageFit.width,
        y: imageFit.top + anchor.y * imageFit.height,
      };
    }
    return result;
  }, [imageFit, visual.territoryAnchors]);

  const attackOverlayAnchor = useMemo(() => {
    if (!battleOverlay) return null;
    const from = projectedAnchors[battleOverlay.fromTerritoryId];
    const to = projectedAnchors[battleOverlay.toTerritoryId];
    if (!from) return null;
    if (!to) {
      return {
        x: Math.max(0.14, Math.min(0.86, from.x)),
        y: Math.max(0.2, Math.min(0.86, from.y + 0.08 * imageFit.height)),
      };
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const midpointX = (from.x + to.x) / 2;
    const midpointY = (from.y + to.y) / 2;
    const overlayOffset = 0.18;
    return {
      x: Math.max(0.14, Math.min(0.86, midpointX + normalX * overlayOffset * imageFit.width)),
      y: Math.max(0.2, Math.min(0.86, midpointY + normalY * overlayOffset * imageFit.height)),
    };
  }, [battleOverlay, imageFit.height, imageFit.width, projectedAnchors]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        setZoomLocked((prev) => !prev);
        return;
      }

      if (zoomLocked) return;
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomOut();
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        reset();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reset, zoomIn, zoomLocked, zoomOut]);

  useEffect(() => {
    const previousTerritories = previousTerritoriesRef.current;
    if (!previousTerritories) {
      previousTerritoriesRef.current = territories;
      return;
    }

    const deltas: FloatingTroopDelta[] = [];
    for (const [territoryId, currentTerritory] of Object.entries(territories)) {
      const previousTerritory = previousTerritories[territoryId];
      if (!previousTerritory) continue;
      const amount = currentTerritory.armies - previousTerritory.armies;
      if (amount === 0) continue;

      const colorOwnerId = amount > 0 ? currentTerritory.ownerId : previousTerritory.ownerId;
      deltas.push({
        id: `${territoryId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        territoryId,
        amount,
        color: getPlayerColor(colorOwnerId, turnOrder),
      });
    }

    previousTerritoriesRef.current = territories;
    if (deltas.length === 0) return;

    let timeout: number | null = null;
    const frame = window.requestAnimationFrame(() => {
      setFloatingDeltas((prev) => [...prev, ...deltas]);
      timeout = window.setTimeout(() => {
        setFloatingDeltas((prev) => prev.filter((delta) => !deltas.some((next) => next.id === delta.id)));
      }, troopDeltaDurationMs);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (timeout !== null) window.clearTimeout(timeout);
    };
  }, [getPlayerColor, territories, troopDeltaDurationMs, turnOrder]);

  if (!imageUrl) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Map image is unavailable.
      </div>
    );
  }

  return (
    <div className="w-full select-none">
      <div
        ref={containerRef}
        className={cn(
          "relative mx-auto aspect-video w-full overflow-hidden rounded-xl border border-border/70 bg-muted touch-none select-none",
          zoomLocked && "touch-auto",
        )}
        {...(zoomLocked ? {} : handlers)}
      >
        <div
          className="relative h-full w-full"
          style={transformStyle}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            if (shouldSuppressClick()) return;
            if (interactive && onClearSelection) onClearSelection();
          }}
        >
          <img
            src={imageUrl}
            alt="Risk map"
            className="h-full w-full object-contain pointer-events-none select-none"
            draggable={false}
          />

          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {graphEdges.map(({ from, to }) => {
              const fromAnchor = projectedAnchors[from];
              const toAnchor = projectedAnchors[to];
              if (!fromAnchor || !toAnchor) return null;

              const touchesFrom = selectedFrom === from || selectedFrom === to;
              const touchesTo = selectedTo === from || selectedTo === to;
              const touchesHighlight =
                highlightedTerritoryIds.has(from) || highlightedTerritoryIds.has(to);
              const isCandidate =
                !!selectedFrom &&
                ((from === selectedFrom && validToIds.has(to)) || (to === selectedFrom && validToIds.has(from)));
              const showActionEdge = isCandidate || touchesTo;
              if (graphEdgeMode === "none") return null;
              if (graphEdgeMode === "action" && !showActionEdge) return null;

              const edgeStroke = touchesTo
                ? "rgba(248,113,113,0.95)"
                : touchesFrom || isCandidate
                  ? "rgba(96,165,250,0.95)"
                  : highlightActive
                    ? touchesHighlight
                      ? "rgba(255,255,255,0.38)"
                      : "rgba(255,255,255,0.09)"
                    : "rgba(255,255,255,0.24)";

              return (
                <line
                  key={`${from}-${to}`}
                  x1={`${fromAnchor.x * 100}%`}
                  y1={`${fromAnchor.y * 100}%`}
                  x2={`${toAnchor.x * 100}%`}
                  y2={`${toAnchor.y * 100}%`}
                  stroke={edgeStroke}
                  strokeWidth={touchesFrom || touchesTo || isCandidate ? 3 : 1.5}
                />
              );
            })}
          </svg>

          {Object.entries(map.territories).map(([territoryId, territory]) => {
            const anchor = projectedAnchors[territoryId];
            const territoryState = territories[territoryId];
            if (!anchor || !territoryState) return null;

            const isFrom = selectedFrom === territoryId;
            const isTo = selectedTo === territoryId;
            const isValidFrom = validFromIds.has(territoryId);
            const isValidTo = validToIds.has(territoryId);
            const selectable = interactive && (isValidFrom || isValidTo);
            const isActionEmphasized = isFrom || isTo || isValidFrom || isValidTo;
            const isHighlighted = !highlightActive || highlightedTerritoryIds.has(territoryId);
            const shouldDeEmphasize = highlightActive && !isHighlighted && !isActionEmphasized;

            return (
              <button
                key={territoryId}
                type="button"
                onClick={() => {
                  if (shouldSuppressClick()) return;
                  onClickTerritory(territoryId);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                disabled={!selectable}
                title={territory.name ?? territoryId}
                className={cn(
                  "absolute min-w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-2 py-1 text-xs font-bold text-white shadow-sm transition",
                  selectable ? "cursor-pointer" : "cursor-default opacity-80",
                  shouldDeEmphasize && "opacity-30 saturate-50",
                  highlightActive && isHighlighted && !isActionEmphasized && "ring-1 ring-white/70",
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

          {floatingDeltas.map((delta) => {
            const anchor = projectedAnchors[delta.territoryId];
            if (!anchor) return null;
            return (
              <span
                key={delta.id}
                className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-0.5 text-sm font-extrabold leading-none text-white backdrop-blur-[1.5px] troop-delta-float"
                style={{
                  left: `${anchor.x * 100}%`,
                  top: `${anchor.y * 100}%`,
                  borderColor: delta.color,
                  backgroundColor: "rgba(10, 12, 16, 0.78)",
                  boxShadow: `0 0 0 1px rgba(0,0,0,0.7), 0 2px 10px ${delta.color}66`,
                  textShadow:
                    "-1px 0 rgba(0,0,0,0.9), 0 1px rgba(0,0,0,0.9), 1px 0 rgba(0,0,0,0.9), 0 -1px rgba(0,0,0,0.9)",
                  animationDuration: `${troopDeltaDurationMs}ms`,
                }}
              >
                {delta.amount > 0 ? `+${delta.amount}` : delta.amount}
              </span>
            );
          })}

          {battleOverlay && attackOverlayAnchor && (
            <div
              className="absolute z-20 w-[min(320px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card/95 p-2 shadow-lg backdrop-blur-sm"
              style={{
                left: `${attackOverlayAnchor.x * 100}%`,
                top: `${attackOverlayAnchor.y * 100}%`,
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <p className="text-xs font-medium text-muted-foreground">
                {battleOverlay.mode === "occupy" ? "Move" : battleOverlay.mode === "fortify" ? "Fortify" : "Attack"}
              </p>
              <p className="mt-0.5 text-sm">
                {battleOverlay.fromLabel ?? "Source"}
                {battleOverlay.toLabel ? ` -> ${battleOverlay.toLabel}` : " -> select target"}
              </p>
              {battleOverlay.mode === "attack" ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {[1, 2, 3].map((dice) => (
                    <Button
                      key={dice}
                      type="button"
                      size="xs"
                      variant={battleOverlay.attackDice === dice ? "default" : "outline"}
                      disabled={dice > battleOverlay.maxDice}
                      onClick={() => battleOverlay.onSetAttackDice(dice)}
                    >
                      {dice}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    size="xs"
                    onClick={battleOverlay.onResolveAttack}
                    disabled={battleOverlay.disabled || !battleOverlay.toLabel}
                  >
                    Resolve
                  </Button>
                  <Button type="button" size="xs" variant="outline" onClick={battleOverlay.onCancelSelection}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={battleOverlay.onEndAttackPhase}
                    disabled={battleOverlay.disabled}
                  >
                    End Attack
                  </Button>
                </div>
              ) : battleOverlay.mode === "occupy" ? (
                <div className="mt-2 flex items-center gap-1.5">
                  <NumberStepper
                    value={battleOverlay.occupyMove}
                    min={battleOverlay.minMove}
                    max={battleOverlay.maxMove}
                    onChange={battleOverlay.onSetOccupyMove}
                    disabled={battleOverlay.disabled}
                    size="xs"
                  />
                  <Button
                    type="button"
                    size="xs"
                    onClick={battleOverlay.onSubmitOccupy}
                    disabled={battleOverlay.disabled}
                  >
                    Move
                  </Button>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-1.5">
                  <NumberStepper
                    value={battleOverlay.fortifyCount}
                    min={battleOverlay.minCount}
                    max={battleOverlay.maxCount}
                    onChange={battleOverlay.onSetFortifyCount}
                    disabled={battleOverlay.disabled}
                    size="xs"
                  />
                  <Button
                    type="button"
                    size="xs"
                    onClick={battleOverlay.onSubmitFortify}
                    disabled={battleOverlay.disabled}
                  >
                    Fortify
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={battleOverlay.onCancelSelection}
                    disabled={battleOverlay.disabled}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 z-30">
          <div
            className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border/60 bg-background/88 p-1 shadow-lg backdrop-blur-sm"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant={zoomLocked ? "default" : "outline"}
                    className="rounded-md"
                    onClick={() => setZoomLocked((prev) => !prev)}
                    aria-label={zoomLocked ? "Unlock map" : "Lock map"}
                  >
                    {zoomLocked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{zoomLocked ? "Unlock map (L)" : "Lock map (L)"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="outline"
                    className="rounded-md"
                    onClick={zoomOut}
                    disabled={zoomLocked}
                    aria-label="Zoom out"
                  >
                    <Minus className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Zoom out (-)</TooltipContent>
              </Tooltip>
              <span className="min-w-11 rounded-md border border-border/50 px-1.5 py-1 text-center text-[11px] font-semibold tabular-nums text-foreground/90">
                {Math.round(scale * 100)}%
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="outline"
                    className="rounded-md"
                    onClick={zoomIn}
                    disabled={zoomLocked}
                    aria-label="Zoom in"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Zoom in (+)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="outline"
                    className="rounded-md"
                    onClick={reset}
                    aria-label="Reset zoom"
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Reset map (R)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
