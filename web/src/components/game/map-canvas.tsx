import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Loader2, Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getReadableTextColor } from "@/lib/color-contrast";
import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/number-stepper";
import { useMapPanZoomInteraction } from "@/lib/game/use-map-pan-zoom-interaction";

interface GraphMapLike {
  territories: Record<string, { name?: string }>;
  adjacency?: Record<string, readonly string[]>;
}

interface VisualLayout {
  imageWidth: number;
  imageHeight: number;
  nodeScale?: number | null;
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
  actionEdgeIds?: Set<string>;
  interactive: boolean;
  troopDeltaDurationMs?: number;
  showTroopDeltas?: boolean;
  maxHeight?: number | string;
  fullscreen?: boolean;
  panZoomEnabled?: boolean;
  onToggleFullscreen?: () => void;
  infoOverlayEnabled?: boolean;
  infoPinnedTerritoryId?: string | null;
  onSetInfoPinnedTerritoryId?: (territoryId: string | null) => void;
  onClickTerritory: (territoryId: string) => void;
  onClearSelection?: () => void;
  onImageRectChange?: (rect: { width: number; height: number }) => void;
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
    autoRunning: boolean;
    resolving: boolean;
    disabled: boolean;
    onSetAttackDice: (dice: number) => void;
    onResolveAttack: () => void;
    onAutoAttack: () => void;
    onStopAutoAttack: () => void;
    onCancelSelection: () => void;
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
    onSubmitOccupyAll: () => void;
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
    onSubmitFortifyAll: () => void;
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
  actionEdgeIds,
  interactive,
  troopDeltaDurationMs = 1000,
  showTroopDeltas = true,
  maxHeight,
  fullscreen = false,
  panZoomEnabled = false,
  onToggleFullscreen,
  infoOverlayEnabled = false,
  infoPinnedTerritoryId = null,
  onSetInfoPinnedTerritoryId = () => undefined,
  onClickTerritory,
  onClearSelection,
  onImageRectChange,
  getPlayerColor,
  battleOverlay,
}: MapCanvasProps) {
  const [floatingDeltas, setFloatingDeltas] = useState<FloatingTroopDelta[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [overlayDragState, setOverlayDragState] = useState<{ key: string; x: number; y: number }>({
    key: "",
    x: 0,
    y: 0,
  });
  const overlayDragRef = useRef<{
    key: string;
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const previousTerritoriesRef = useRef<Record<string, TerritoryState> | null>(null);
  const {
    containerRef,
    scale,
    transformStyle,
    isGestureActive,
    zoomIn,
    zoomOut,
    reset,
    bindViewportHandlers,
    markInteractiveTargetPointerDown,
    shouldSuppressClick,
  } = useMapPanZoomInteraction({
    enabled: panZoomEnabled,
    minScale: 1,
    maxScale: 6,
    zoomStep: 0.2,
    longPressMs: 180,
    dragThresholdPx: 6,
    clickSuppressWindowMs: 160,
  });
  const frameAspect =
    containerSize.width > 0 && containerSize.height > 0
      ? containerSize.width / containerSize.height
      : 4 / 3;
  const imageAspect = visual.imageWidth / visual.imageHeight;
  const highlightActive = highlightedTerritoryIds.size > 0;
  const explicitActionEdges = actionEdgeIds !== undefined && actionEdgeIds.size > 0;
  const supportsHover =
    typeof window !== "undefined" && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;

  const withAlpha = (color: string, alpha: number) => {
    if (color.startsWith("#") && color.length === 7) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    return color;
  };

  const graphEdges = Object.entries(map.adjacency ?? {}).flatMap(([from, neighbors]) =>
    neighbors
      .filter((to) => from < to)
      .map((to) => ({ from, to })),
  );

  const imageFit = useMemo(() => {
    if (fullscreen) {
      if (imageAspect >= frameAspect) {
        const drawWidth = imageAspect / frameAspect;
        const left = (1 - drawWidth) / 2;
        return { left, top: 0, width: drawWidth, height: 1 };
      }
      const drawHeight = frameAspect / imageAspect;
      const top = (1 - drawHeight) / 2;
      return { left: 0, top, width: 1, height: drawHeight };
    }

    if (imageAspect >= frameAspect) {
      const drawHeight = frameAspect / imageAspect;
      const top = (1 - drawHeight) / 2;
      return { left: 0, top, width: 1, height: drawHeight };
    }
    const drawWidth = imageAspect / frameAspect;
    const left = (1 - drawWidth) / 2;
    return { left, top: 0, width: drawWidth, height: 1 };
  }, [frameAspect, fullscreen, imageAspect]);

  const imagePixelSize = useMemo(() => {
    if (!containerSize.width || !containerSize.height) return { width: 0, height: 0 };
    return {
      width: containerSize.width * imageFit.width,
      height: containerSize.height * imageFit.height,
    };
  }, [containerSize.height, containerSize.width, imageFit.height, imageFit.width]);

  const markerScaleFactor = 0.035;
  const imageSurfaceStyle = useMemo(
    () => ({
      left: `${imageFit.left * 100}%`,
      top: `${imageFit.top * 100}%`,
      width: `${imageFit.width * 100}%`,
      height: `${imageFit.height * 100}%`,
    }),
    [imageFit.height, imageFit.left, imageFit.top, imageFit.width],
  );
  const nodeScale = useMemo(() => {
    if (typeof visual.nodeScale !== "number" || !Number.isFinite(visual.nodeScale)) return 1;
    return Math.max(0.2, Math.min(3, visual.nodeScale));
  }, [visual.nodeScale]);
  const markerSize = useMemo(() => {
    if (!imagePixelSize.width || !imagePixelSize.height) return 18;
    const base = Math.min(imagePixelSize.width, imagePixelSize.height) * markerScaleFactor;
    return base * nodeScale;
  }, [imagePixelSize.height, imagePixelSize.width, markerScaleFactor, nodeScale]);

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
    const clampOverlayX = (value: number) => Math.max(0.14, Math.min(0.86, value));
    const clampOverlayY = (value: number) => Math.max(0.2, Math.min(0.86, value));
    const center = { x: 0.5, y: 0.5 };
    const from = projectedAnchors[battleOverlay.fromTerritoryId];
    const to = projectedAnchors[battleOverlay.toTerritoryId];
    if (!from) return null;
    if (!to) {
      return {
        x: clampOverlayX(from.x + (center.x - from.x) * 0.2),
        y: clampOverlayY(from.y + (center.y - from.y) * 0.24),
      };
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const midpointX = (from.x + to.x) / 2;
    const midpointY = (from.y + to.y) / 2;
    const overlayOffset = 0.16;
    const inwardBiasX = (center.x - midpointX) * 0.2;
    const inwardBiasY = (center.y - midpointY) * 0.2;
    return {
      x: clampOverlayX(midpointX + normalX * overlayOffset * imageFit.width + inwardBiasX),
      y: clampOverlayY(midpointY + normalY * overlayOffset * imageFit.height + inwardBiasY),
    };
  }, [battleOverlay, imageFit.height, imageFit.width, projectedAnchors]);
  const overlayDragKey = battleOverlay
    ? `${battleOverlay.mode}:${battleOverlay.fromTerritoryId}:${battleOverlay.toTerritoryId}`
    : "none";
  const overlayDragOffset =
    overlayDragState.key === overlayDragKey ? { x: overlayDragState.x, y: overlayDragState.y } : { x: 0, y: 0 };
  const frameStyle = fullscreen
    ? { width: "100%", height: "100%" }
    : maxHeight
      ? {
        maxHeight,
        maxWidth: typeof maxHeight === "number" ? `${(maxHeight * 4) / 3}px` : `calc(${maxHeight} * 4 / 3)`,
      }
      : undefined;

  const onStartOverlayDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!battleOverlay) return;
    if (panZoomEnabled) {
      markInteractiveTargetPointerDown(event.pointerId);
    }
    overlayDragRef.current = {
      key: overlayDragKey,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: overlayDragOffset.x,
      originY: overlayDragOffset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
  };

  const onOverlayDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = overlayDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    setOverlayDragState({
      key: dragState.key,
      x: dragState.originX + event.clientX - dragState.startX,
      y: dragState.originY + event.clientY - dragState.startY,
    });
    event.stopPropagation();
  };

  const onEndOverlayDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = overlayDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    overlayDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    event.stopPropagation();
  };

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    if (!onImageRectChange) return;
    if (!imagePixelSize.width || !imagePixelSize.height) return;
    onImageRectChange({ width: imagePixelSize.width, height: imagePixelSize.height });
  }, [imagePixelSize.height, imagePixelSize.width, onImageRectChange]);

  useEffect(() => {
    if (panZoomEnabled) return;
    reset();
  }, [panZoomEnabled, reset]);

  useEffect(() => {
    if (!showTroopDeltas) {
      previousTerritoriesRef.current = territories;
      const frame = window.requestAnimationFrame(() => {
        setFloatingDeltas([]);
      });
      return () => window.cancelAnimationFrame(frame);
    }

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
  }, [getPlayerColor, showTroopDeltas, territories, troopDeltaDurationMs, turnOrder]);

  const battleOverlayContent = battleOverlay ? (
    <>
      <div className="flex items-center justify-between gap-2 rounded-md px-1 py-0.5">
        <p
          className={cn(
            "cursor-grab text-xs font-medium active:cursor-grabbing",
            battleOverlay.mode === "attack" && battleOverlay.resolving ? "text-primary" : "text-muted-foreground",
          )}
          onPointerDown={onStartOverlayDrag}
          onPointerMove={onOverlayDragMove}
          onPointerUp={onEndOverlayDrag}
          onPointerCancel={onEndOverlayDrag}
        >
          <span
            className={cn(
              "inline-flex items-center gap-1.5",
              battleOverlay.mode === "attack" && battleOverlay.resolving && "animate-pulse",
            )}
          >
            {battleOverlay.mode === "occupy"
              ? "Move"
              : battleOverlay.mode === "fortify"
                ? "Fortify"
                : battleOverlay.resolving
                  ? "Attacking..."
                  : "Attack"}
            {battleOverlay.mode === "attack" && battleOverlay.resolving && <Loader2 className="size-3 animate-spin" />}
          </span>
        </p>
        {(battleOverlay.mode === "attack" || battleOverlay.mode === "fortify") && (
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Close"
            onClick={battleOverlay.onCancelSelection}
            disabled={battleOverlay.disabled}
            className="size-6"
            onPointerDown={(event) => {
              if (panZoomEnabled) markInteractiveTargetPointerDown(event.pointerId);
              event.stopPropagation();
            }}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
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
              disabled={dice > battleOverlay.maxDice || battleOverlay.resolving}
              onClick={() => battleOverlay.onSetAttackDice(dice)}
            >
              {dice}
            </Button>
          ))}
          <Button
            type="button"
            size="xs"
            onClick={battleOverlay.onResolveAttack}
            disabled={
              battleOverlay.disabled ||
              battleOverlay.resolving ||
              !battleOverlay.toLabel ||
              battleOverlay.maxDice < 1
            }
          >
            Attack
          </Button>
          <Button
            type="button"
            size="xs"
            className="min-w-16"
            variant={battleOverlay.autoRunning ? "default" : "outline"}
            onClick={battleOverlay.onAutoAttack}
            disabled={
              battleOverlay.disabled ||
              battleOverlay.resolving ||
              !battleOverlay.toLabel ||
              (!battleOverlay.autoRunning && battleOverlay.maxDice < 3)
            }
          >
            Auto
          </Button>
          {battleOverlay.autoRunning && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={battleOverlay.onStopAutoAttack}
            >
              Stop
            </Button>
          )}
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
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={battleOverlay.onSubmitOccupyAll}
            disabled={battleOverlay.disabled || battleOverlay.maxMove <= battleOverlay.minMove}
          >
            All
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
            onClick={battleOverlay.onSubmitFortifyAll}
            disabled={battleOverlay.disabled || battleOverlay.maxCount < battleOverlay.minCount}
          >
            All
          </Button>
        </div>
      )}
    </>
  ) : null;

  if (!imageUrl) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Map image is unavailable.
      </div>
    );
  }

  return (
    <div className={cn("w-full select-none", fullscreen && "h-full")}>
      <div
        ref={containerRef}
        className={cn(
          "relative w-full max-w-full overflow-hidden bg-muted select-none",
          fullscreen ? "h-full rounded-none border-0" : "mx-auto aspect-[4/3] rounded-xl border border-border/70",
          panZoomEnabled && "game-map-viewport-touch",
          panZoomEnabled && isGestureActive && "cursor-grabbing",
        )}
        style={frameStyle}
      >
        {onToggleFullscreen && (
          <div className="pointer-events-none absolute right-2 top-2 z-10">
            <Button
              type="button"
              size="icon-xs"
              variant="outline"
              aria-label={fullscreen ? "Exit fullscreen map" : "Enter fullscreen map"}
              className="pointer-events-auto bg-card/90 backdrop-blur-sm"
              onClick={onToggleFullscreen}
              onPointerDown={(event) => {
                markInteractiveTargetPointerDown(event.pointerId);
                event.stopPropagation();
              }}
            >
              {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </Button>
          </div>
        )}

        {fullscreen && panZoomEnabled && (
          <div
            className="pointer-events-none absolute left-2 top-2 z-10"
            onPointerDown={(event) => {
              markInteractiveTargetPointerDown(event.pointerId);
              event.stopPropagation();
            }}
          >
            <div className="pointer-events-auto inline-flex items-center gap-1 rounded border border-border/70 bg-card/90 p-1 shadow-sm backdrop-blur-sm">
              <Button type="button" size="icon-xs" variant="outline" onClick={zoomOut} aria-label="Zoom out">
                <Minus className="size-3.5" />
              </Button>
              <span className="w-12 text-center text-xs font-semibold">{Math.round(scale * 100)}%</span>
              <Button type="button" size="icon-xs" variant="outline" onClick={zoomIn} aria-label="Zoom in">
                <Plus className="size-3.5" />
              </Button>
              <Button type="button" size="xs" variant="outline" onClick={reset}>Reset</Button>
            </div>
          </div>
        )}
        <div
          className="relative h-full w-full"
          {...bindViewportHandlers}
          onClick={(event) => {
            if (panZoomEnabled && shouldSuppressClick()) return;
            if (event.target !== event.currentTarget) return;
            if (infoOverlayEnabled) {
              onSetInfoPinnedTerritoryId(null);
            }
            if (interactive && onClearSelection) onClearSelection();
          }}
        >
          <div className="relative h-full w-full" style={transformStyle}>
            <img
              src={imageUrl}
              alt="Global Domination map"
              className={cn(
                "pointer-events-none absolute max-w-none select-none transition-[filter] duration-200",
                highlightActive && "saturate-50",
              )}
              style={imageSurfaceStyle}
              draggable={false}
            />

            <svg className="pointer-events-none absolute inset-0 h-full w-full">
              {graphEdges.map(({ from, to }) => {
                const fromAnchor = projectedAnchors[from];
                const toAnchor = projectedAnchors[to];
                if (!fromAnchor || !toAnchor) return null;

                const touchesFrom = selectedFrom === from || selectedFrom === to;
                const touchesHighlight =
                  highlightedTerritoryIds.has(from) || highlightedTerritoryIds.has(to);
                const edgeKey = from < to ? `${from}|${to}` : `${to}|${from}`;
                const hasExplicitEdge = !!actionEdgeIds?.has(edgeKey);
                const isCandidate =
                  !!selectedFrom &&
                  ((from === selectedFrom && validToIds.has(to)) || (to === selectedFrom && validToIds.has(from)));
                const isSelectedPair =
                  !!selectedFrom &&
                  !!selectedTo &&
                  ((from === selectedFrom && to === selectedTo) || (to === selectedFrom && from === selectedTo));
                const showActionEdge = explicitActionEdges
                  ? hasExplicitEdge
                  : selectedTo
                    ? isSelectedPair
                    : isCandidate || isSelectedPair;
                if (graphEdgeMode === "none") return null;
                if (graphEdgeMode === "action" && !showActionEdge) return null;

                const fromOwner = territories[from]?.ownerId ?? "neutral";
                const fromOwnerColor = getPlayerColor(fromOwner, turnOrder);
                const selectedOwnerColor = selectedFrom
                  ? getPlayerColor(territories[selectedFrom]?.ownerId ?? "neutral", turnOrder)
                  : null;
                const actionEdgeBase = showActionEdge && selectedOwnerColor ? selectedOwnerColor : fromOwnerColor;
                const actionEdgeColor = withAlpha(actionEdgeBase, 0.7);

                const edgeStroke = isSelectedPair
                  ? withAlpha(actionEdgeBase, 0.95)
                  : touchesFrom || isCandidate || showActionEdge
                    ? actionEdgeColor
                    : highlightActive
                      ? touchesHighlight
                        ? "rgba(255,255,255,0.24)"
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
                    strokeWidth={touchesFrom || isCandidate || isSelectedPair || showActionEdge ? 3 : 1.5}
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
            const isHighlighted = !highlightActive || highlightedTerritoryIds.has(territoryId);
            const shouldDeEmphasize = highlightActive && !isHighlighted && !isFrom && !isTo;
            const ownerColor = getPlayerColor(territoryState.ownerId, turnOrder);
            const actionOutline = withAlpha(ownerColor, 0.9);
            const actionEdge = withAlpha(ownerColor, 0.75);
            const isActionable = isFrom || isTo || isValidFrom || isValidTo;
            const outlineWidth = isFrom || isTo ? 2.5 : isActionable ? 1.5 : 0;
            const outlineColor = isFrom || isTo ? actionOutline : isActionable ? actionEdge : "transparent";

            const showInfo = infoOverlayEnabled && infoPinnedTerritoryId === territoryId;
            const markerBackgroundColor = getPlayerColor(territoryState.ownerId, turnOrder);
            const markerTextColor = getReadableTextColor(markerBackgroundColor);

            return (
              <div
                key={territoryId}
                className="absolute"
                style={{
                  left: `${anchor.x * 100}%`,
                  top: `${anchor.y * 100}%`,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (panZoomEnabled && shouldSuppressClick()) return;
                    if (infoOverlayEnabled && !supportsHover) {
                      onSetInfoPinnedTerritoryId(infoPinnedTerritoryId === territoryId ? null : territoryId);
                    }
                    onClickTerritory(territoryId);
                  }}
                  onPointerDown={(event) => {
                    if (panZoomEnabled) markInteractiveTargetPointerDown(event.pointerId);
                  }}
                  disabled={!selectable && !infoOverlayEnabled}
                  title={territory.name ?? territoryId}
                  onMouseEnter={() => {
                    if (infoOverlayEnabled && supportsHover) {
                      onSetInfoPinnedTerritoryId(territoryId);
                    }
                  }}
                  onMouseLeave={() => {
                    if (infoOverlayEnabled && supportsHover) {
                      onSetInfoPinnedTerritoryId(infoPinnedTerritoryId === territoryId ? null : infoPinnedTerritoryId);
                    }
                  }}
                  className={cn(
                    "flex items-center justify-center rounded-full border-2 px-0 py-0 font-bold shadow-sm transition-opacity",
                    selectable || infoOverlayEnabled ? "cursor-pointer" : "cursor-default opacity-80",
                    shouldDeEmphasize && "opacity-30 saturate-50",
                  )}
                  style={{
                    outline: outlineWidth > 0 ? `${outlineWidth}px solid ${outlineColor}` : "none",
                    outlineOffset: outlineWidth > 0 ? 2 : 0,
                    backgroundColor: markerBackgroundColor,
                    color: markerTextColor,
                    borderColor: isActionable ? actionEdge : "transparent",
                    minWidth: `${markerSize * 1.6}px`,
                    height: `${markerSize}px`,
                    padding: `0 ${markerSize * 0.35}px`,
                    fontSize: `${markerSize * 0.45}px`,
                    lineHeight: 1,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {territoryState.armies}
                </button>
                {showInfo && (
                  <div
                    className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/70 bg-background/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground shadow-sm"
                    style={{
                      top: `calc(-100% - ${markerSize * 0.6}px)`,
                    }}
                  >
                    {territory.name ?? territoryId}
                  </div>
                )}
              </div>
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

            {battleOverlay && attackOverlayAnchor && battleOverlayContent && (
              <div
                className={cn(
                  "absolute z-20 w-[min(320px,92vw)] rounded-lg border bg-card/95 p-2 shadow-lg backdrop-blur-sm",
                  fullscreen ? "block" : "hidden sm:block",
                )}
                style={{
                  left: `${attackOverlayAnchor.x * 100}%`,
                  top: `${attackOverlayAnchor.y * 100}%`,
                  transform: `translate(calc(-50% + ${overlayDragOffset.x}px), calc(-50% + ${overlayDragOffset.y}px))`,
                }}
                onPointerDown={(event) => {
                  if (panZoomEnabled) markInteractiveTargetPointerDown(event.pointerId);
                  event.stopPropagation();
                }}
              >
                {battleOverlayContent}
              </div>
            )}
          </div>
        </div>
      </div>
      {!fullscreen && battleOverlay && battleOverlayContent && (
        <div className="mt-2 flex justify-center sm:hidden">
          <div className="w-[min(320px,92vw)] rounded-lg border bg-card/95 p-2 shadow-lg backdrop-blur-sm">
            {battleOverlayContent}
          </div>
        </div>
      )}
    </div>
  );
}
