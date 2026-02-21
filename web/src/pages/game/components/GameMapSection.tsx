import { MapCanvas } from "@/components/game/map-canvas";
import { GameEventsCard } from "@/components/game/game-panels";
import type { ComponentProps, RefObject } from "react";
import type { PublicState } from "@/lib/game/types";

interface GameMapSectionProps {
  mapPanelRef: RefObject<HTMLDivElement | null>;
  mapPanelHeight: number | null;
  mapPanelWidth: number | null;
  mapImageWidth: number | null;
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
  onSetInfoPinnedTerritoryId: (territoryId: string | null) => void;
  troopDeltaDurationMs: number;
  suppressTroopDeltas: boolean;
  onTerritoryClick: (territoryId: string) => void;
  onMapImageRectChange: (rect: { width: number; height: number }) => void;
  onClearSelection: () => void;
  getPlayerColor: (playerId: string, turnOrder: string[]) => string;
  battleOverlay: ComponentProps<typeof MapCanvas>["battleOverlay"];
  historyEvents: Array<{ key: string; text: string; index: number }>;
  activeHistoryEventIndex: number | null;
  onSelectHistoryEvent: (index: number) => void;
}

export function GameMapSection({
  mapPanelRef,
  mapPanelHeight,
  mapPanelWidth,
  mapImageWidth,
  mapMaxHeight,
  graphMap,
  mapVisual,
  mapImageUrl,
  playbackTerritories,
  resolvedDisplayState,
  mapSelectedFrom,
  mapSelectedTo,
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
  onSetInfoPinnedTerritoryId,
  troopDeltaDurationMs,
  suppressTroopDeltas,
  onTerritoryClick,
  onMapImageRectChange,
  onClearSelection,
  getPlayerColor,
  battleOverlay,
  historyEvents,
  activeHistoryEventIndex,
  onSelectHistoryEvent,
}: GameMapSectionProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4" data-map-canvas-zone="true">
      <div
        className={`flex min-w-0 flex-col ${
          historyOpen ? "gap-3" : "gap-0"
        } [@media(orientation:landscape)]:flex-row [@media(orientation:landscape)]:items-start`}
      >
        <div ref={mapPanelRef} className="min-w-0 flex-1">
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
            infoOverlayEnabled={infoOverlayEnabled}
            infoPinnedTerritoryId={infoPinnedTerritoryId}
            onSetInfoPinnedTerritoryId={onSetInfoPinnedTerritoryId}
            onClickTerritory={onTerritoryClick}
            onImageRectChange={onMapImageRectChange}
            onClearSelection={onClearSelection}
            getPlayerColor={getPlayerColor}
            battleOverlay={battleOverlay}
          />
        </div>
        <div
          className={`hidden min-h-0 shrink-0 overflow-hidden transition-[width,transform,opacity] duration-220 ease-out [@media(orientation:landscape)]:flex ${historyOpen
            ? "w-[min(34vw,300px)] translate-x-0 opacity-100"
            : "pointer-events-none w-0 translate-x-10 opacity-0"
            }`}
          style={{
            height: mapPanelHeight ?? mapMaxHeight,
            maxHeight: mapMaxHeight,
          }}
          aria-hidden={!historyOpen}
        >
          <div className="h-full min-h-0 w-[min(34vw,300px)] overflow-hidden">
            <GameEventsCard
              events={historyEvents}
              activeIndex={activeHistoryEventIndex}
              onSelectEvent={onSelectHistoryEvent}
            />
          </div>
        </div>
      </div>

      <div
        className="mx-auto grid w-full gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
        style={{
          maxWidth:
            mapImageWidth && mapPanelWidth
              ? `${Math.min(mapImageWidth, mapPanelWidth)}px`
              : mapImageWidth
                ? `${mapImageWidth}px`
                : mapPanelWidth
                  ? `${mapPanelWidth}px`
                  : undefined,
        }}
      >
        {historyOpen && (
          <div className="h-[25vh] min-h-0 overflow-hidden [@media(orientation:landscape)]:hidden">
            <GameEventsCard
              events={historyEvents}
              activeIndex={activeHistoryEventIndex}
              onSelectEvent={onSelectHistoryEvent}
            />
          </div>
        )}
      </div>
    </div>
  );
}
