import { MapCanvas } from "@/components/game/map-canvas";
import type { ComponentProps, RefObject } from "react";
import type { PublicState } from "@/lib/game/types";
import { cn } from "@/lib/utils";
import type { AttackDiceResult } from "@/lib/game/attack-dice-result";

interface GameMapSectionProps {
  mapPanelRef: RefObject<HTMLDivElement | null>;
  mapMaxHeight: string;
  graphMap: {
    territories: Record<string, { name?: string }>;
    adjacency?: Record<string, readonly string[]>;
  };
  mapVisual: {
    imageWidth: number;
    imageHeight: number;
    nodeScale?: number | null;
    territoryAnchors: Record<string, { x: number; y: number }>;
  };
  mapImageUrl: string | null;
  playbackTerritories: Record<string, { ownerId: string; armies: number }>;
  resolvedDisplayState: PublicState;
  mapSelectedFrom: string | null;
  mapSelectedTo: string | null;
  isMapFullscreen: boolean;
  historyOpen: boolean;
  isMyTurn: boolean;
  validFromIds: Set<string>;
  validToIds: Set<string>;
  highlightedTerritoryIds: Set<string>;
  showActionEdges: boolean;
  historyAttackEdgeIds: Set<string> | null;
  recentAttackEdgeIds: Set<string> | null;
  fortifyConnectedEdgeIds: Set<string> | undefined;
  infoOverlayEnabled: boolean;
  infoPinnedTerritoryId: string | null;
  externalFocusTerritoryId?: string | null;
  externalFocusTerritoryTooltip?: boolean;
  onSetInfoPinnedTerritoryId: (territoryId: string | null) => void;
  troopDeltaDurationMs: number;
  suppressTroopDeltas: boolean;
  onTerritoryClick: (territoryId: string) => void;
  onTerritoryRightClick: (territoryId: string) => void;
  rightClickableTerritoryIds: Set<string>;
  onMapImageRectChange: (rect: { width: number; height: number }) => void;
  onClearSelection: () => void;
  onToggleFullscreen: () => void;
  getPlayerColor: (playerId: string, turnOrder: string[]) => string;
  getPlayerLabel?: (playerId: string) => string;
  getPlayerGroupId?: (playerId: string) => string;
  battleOverlay: ComponentProps<typeof MapCanvas>["battleOverlay"];
  attackDicePrototypeResult: AttackDiceResult | null;
}

export function GameMapSection({
  mapPanelRef,
  mapMaxHeight,
  graphMap,
  mapVisual,
  mapImageUrl,
  playbackTerritories,
  resolvedDisplayState,
  mapSelectedFrom,
  mapSelectedTo,
  isMapFullscreen,
  historyOpen,
  isMyTurn,
  validFromIds,
  validToIds,
  highlightedTerritoryIds,
  showActionEdges,
  historyAttackEdgeIds,
  recentAttackEdgeIds,
  fortifyConnectedEdgeIds,
  infoOverlayEnabled,
  infoPinnedTerritoryId,
  externalFocusTerritoryId = null,
  externalFocusTerritoryTooltip = false,
  onSetInfoPinnedTerritoryId,
  troopDeltaDurationMs,
  suppressTroopDeltas,
  onTerritoryClick,
  onTerritoryRightClick,
  rightClickableTerritoryIds,
  onMapImageRectChange,
  onClearSelection,
  onToggleFullscreen,
  getPlayerColor,
  getPlayerLabel,
  getPlayerGroupId,
  battleOverlay,
  attackDicePrototypeResult,
}: GameMapSectionProps) {
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-4", isMapFullscreen && "h-full gap-0 overflow-hidden")}
      data-map-canvas-zone="true"
    >
      <div
        className={cn(
          `flex min-w-0 flex-col ${historyOpen ? "gap-3" : "gap-0"} [@media(orientation:landscape)]:flex-row [@media(orientation:landscape)]:items-start`,
          isMapFullscreen && "flex-1 h-full overflow-hidden",
        )}
      >
        <div ref={mapPanelRef} className={cn("min-w-0 flex-1", isMapFullscreen && "h-full overflow-hidden")}>
          <MapCanvas
            map={graphMap}
            visual={mapVisual}
            imageUrl={mapImageUrl}
            territories={playbackTerritories}
            turnOrder={resolvedDisplayState.turnOrder}
            selectedFrom={mapSelectedFrom}
            selectedTo={mapSelectedTo}
            validFromIds={!historyOpen && isMyTurn ? validFromIds : new Set()}
            validToIds={!historyOpen && isMyTurn ? validToIds : new Set()}
            highlightedTerritoryIds={highlightedTerritoryIds}
            graphEdgeMode={
              infoOverlayEnabled
                ? "all"
                : showActionEdges || !!historyAttackEdgeIds || !!recentAttackEdgeIds
                  ? "action"
                  : "none"
            }
            actionEdgeIds={historyAttackEdgeIds ?? fortifyConnectedEdgeIds ?? recentAttackEdgeIds ?? undefined}
            interactive={!historyOpen && isMyTurn}
            troopDeltaDurationMs={troopDeltaDurationMs}
            showTroopDeltas={!suppressTroopDeltas}
            maxHeight={mapMaxHeight}
            fullscreen={isMapFullscreen}
            panZoomEnabled={isMapFullscreen}
            onToggleFullscreen={onToggleFullscreen}
            infoOverlayEnabled={infoOverlayEnabled}
            infoPinnedTerritoryId={infoPinnedTerritoryId}
            externalFocusTerritoryId={externalFocusTerritoryId}
            externalFocusTerritoryTooltip={externalFocusTerritoryTooltip}
            onSetInfoPinnedTerritoryId={onSetInfoPinnedTerritoryId}
            onClickTerritory={onTerritoryClick}
            onRightClickTerritory={onTerritoryRightClick}
            rightClickableTerritoryIds={rightClickableTerritoryIds}
            onImageRectChange={onMapImageRectChange}
            onClearSelection={onClearSelection}
            getPlayerColor={getPlayerColor}
            getPlayerLabel={getPlayerLabel}
            getPlayerGroupId={getPlayerGroupId}
            battleOverlay={battleOverlay}
            attackDicePrototypeResult={attackDicePrototypeResult}
          />
        </div>
      </div>
    </div>
  );
}
