import { useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MapCanvas } from "@/components/game/map-canvas";
import { toast } from "sonner";
import type {
  Action,
  TerritoryId,
  CardId,
  Phase,
} from "risk-engine";
import type { GraphMap } from "risk-engine";

const PLAYER_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#f97316",
];
const NEUTRAL_COLOR = "#6b7280";

type PublicState = {
  players: Record<string, { status: string; teamId?: string }>;
  turnOrder: string[];
  territories: Record<string, { ownerId: string; armies: number }>;
  turn: { currentPlayerId: string; phase: Phase; round: number };
  pending?: {
    type: "Occupy";
    from: string;
    to: string;
    minMove: number;
    maxMove: number;
  };
  reinforcements?: { remaining: number; sources?: Record<string, number> };
  capturedThisTurn: boolean;
  tradesCompleted: number;
  deckCount: number;
  discardCount: number;
  handSizes: Record<string, number>;
  stateVersion: number;
};

type HandCard = { cardId: string; kind: string; territoryId?: string };
type MapVisual = {
  imageStorageId: string;
  imageWidth: number;
  imageHeight: number;
  territoryAnchors: Record<string, { x: number; y: number }>;
};

function getPlayerColor(
  playerId: string,
  turnOrder: string[],
): string {
  if (playerId === "neutral") return NEUTRAL_COLOR;
  const idx = turnOrder.indexOf(playerId);
  return PLAYER_COLORS[idx % PLAYER_COLORS.length] ?? NEUTRAL_COLOR;
}

function PlayerLegend({
  state,
  playerMap,
}: {
  state: PublicState;
  playerMap: Array<{
    userId: string;
    displayName: string;
    enginePlayerId: string | null;
  }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {state.turnOrder.map((pid) => {
        const color = getPlayerColor(pid, state.turnOrder);
        const info = playerMap.find((p) => p.enginePlayerId === pid);
        const isCurrentTurn = state.turn.currentPlayerId === pid;
        const status = state.players[pid]?.status ?? "alive";
        return (
          <div
            key={pid}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
              isCurrentTurn ? "border-foreground font-semibold" : "border-border"
            } ${status === "defeated" ? "opacity-40 line-through" : ""}`}
          >
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span>{info?.displayName ?? pid}</span>
            {isCurrentTurn && state.turn.phase !== "GameOver" && (
              <span className="text-[10px] text-muted-foreground">◀</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PhaseIndicator({ state }: { state: PublicState }) {
  const { phase, round } = state.turn;
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{phase}</span>
        {state.reinforcements && phase === "Reinforcement" && (
          <span className="text-muted-foreground">
            ({state.reinforcements.remaining} remaining)
          </span>
        )}
      </div>
      <span className="text-xs text-muted-foreground">Round {round}</span>
    </div>
  );
}

function ReinforcementControls({
  state,
  selectedFrom,
  count,
  setCount,
  onSubmit,
  disabled,
}: {
  state: PublicState;
  selectedFrom: string | null;
  count: number;
  setCount: (n: number) => void;
  onSubmit: (action: Action) => void;
  disabled: boolean;
}) {
  const remaining = state.reinforcements?.remaining ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Select a territory to place armies ({remaining} remaining)
      </p>
      {selectedFrom && (
        <div className="flex items-center gap-2">
          <Button
            size="icon-xs"
            variant="outline"
            onClick={() => setCount(Math.max(1, count - 1))}
            disabled={count <= 1}
          >
            -
          </Button>
          <span className="w-8 text-center text-sm font-semibold">{count}</span>
          <Button
            size="icon-xs"
            variant="outline"
            onClick={() => setCount(Math.min(remaining, count + 1))}
            disabled={count >= remaining}
          >
            +
          </Button>
          <Button
            size="sm"
            disabled={disabled || !selectedFrom}
            onClick={() =>
              onSubmit({
                type: "PlaceReinforcements",
                territoryId: selectedFrom as TerritoryId,
                count,
              })
            }
          >
            Place
          </Button>
        </div>
      )}
    </div>
  );
}

function AttackControls({
  selectedFrom,
  selectedTo,
  state,
  dice,
  setDice,
  onSubmit,
  disabled,
}: {
  selectedFrom: string | null;
  selectedTo: string | null;
  state: PublicState;
  dice: number;
  setDice: (n: number) => void;
  onSubmit: (action: Action) => void;
  disabled: boolean;
}) {
  const fromArmies = selectedFrom
    ? state.territories[selectedFrom]?.armies ?? 0
    : 0;
  const maxDice = Math.min(3, fromArmies - 1);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        {!selectedFrom
          ? "Select a territory to attack from"
          : !selectedTo
            ? "Select an enemy territory to attack"
            : "Ready to attack"}
      </p>
      {selectedFrom && selectedTo && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Dice:</span>
          {[1, 2, 3].map((d) => (
            <Button
              key={d}
              size="xs"
              variant={dice === d ? "default" : "outline"}
              disabled={d > maxDice}
              onClick={() => setDice(d)}
            >
              {d}
            </Button>
          ))}
          <Button
            size="sm"
            disabled={disabled}
            onClick={() =>
              onSubmit({
                type: "Attack",
                from: selectedFrom as TerritoryId,
                to: selectedTo as TerritoryId,
                attackerDice: dice,
              })
            }
          >
            Attack!
          </Button>
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => onSubmit({ type: "EndAttackPhase" })}
      >
        End Attack Phase
      </Button>
    </div>
  );
}

function OccupyControls({
  state,
  moveArmies,
  setMoveArmies,
  onSubmit,
  disabled,
}: {
  state: PublicState;
  moveArmies: number;
  setMoveArmies: (n: number) => void;
  onSubmit: (action: Action) => void;
  disabled: boolean;
}) {
  const pending = state.pending;
  if (!pending) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Move armies from{" "}
        <span className="font-semibold">{pending.from}</span> to{" "}
        <span className="font-semibold">{pending.to}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="icon-xs"
          variant="outline"
          onClick={() => setMoveArmies(Math.max(pending.minMove, moveArmies - 1))}
          disabled={moveArmies <= pending.minMove}
        >
          -
        </Button>
        <span className="w-8 text-center text-sm font-semibold">
          {moveArmies}
        </span>
        <Button
          size="icon-xs"
          variant="outline"
          onClick={() => setMoveArmies(Math.min(pending.maxMove, moveArmies + 1))}
          disabled={moveArmies >= pending.maxMove}
        >
          +
        </Button>
        <span className="text-xs text-muted-foreground">
          ({pending.minMove}-{pending.maxMove})
        </span>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => onSubmit({ type: "Occupy", moveArmies })}
        >
          Move
        </Button>
      </div>
    </div>
  );
}

function FortifyControls({
  selectedFrom,
  selectedTo,
  count,
  setCount,
  state,
  onSubmit,
  disabled,
}: {
  selectedFrom: string | null;
  selectedTo: string | null;
  count: number;
  setCount: (n: number) => void;
  state: PublicState;
  onSubmit: (action: Action) => void;
  disabled: boolean;
}) {
  const fromArmies = selectedFrom
    ? state.territories[selectedFrom]?.armies ?? 0
    : 0;
  const maxCount = fromArmies - 1;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        {!selectedFrom
          ? "Select a territory to fortify from"
          : !selectedTo
            ? "Select a connected friendly territory"
            : "Ready to fortify"}
      </p>
      {selectedFrom && selectedTo && maxCount > 0 && (
        <div className="flex items-center gap-2">
          <Button
            size="icon-xs"
            variant="outline"
            onClick={() => setCount(Math.max(1, count - 1))}
            disabled={count <= 1}
          >
            -
          </Button>
          <span className="w-8 text-center text-sm font-semibold">{count}</span>
          <Button
            size="icon-xs"
            variant="outline"
            onClick={() => setCount(Math.min(maxCount, count + 1))}
            disabled={count >= maxCount}
          >
            +
          </Button>
          <Button
            size="sm"
            disabled={disabled}
            onClick={() =>
              onSubmit({
                type: "Fortify",
                from: selectedFrom as TerritoryId,
                to: selectedTo as TerritoryId,
                count,
              })
            }
          >
            Fortify
          </Button>
        </div>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => onSubmit({ type: "EndTurn" })}
      >
        End Turn
      </Button>
    </div>
  );
}

function CardsPanel({
  myHand,
  selectedCardIds,
  toggleCard,
  onTrade,
  canTrade,
  disabled,
  map,
}: {
  myHand: HandCard[];
  selectedCardIds: Set<string>;
  toggleCard: (id: string) => void;
  onTrade: () => void;
  canTrade: boolean;
  disabled: boolean;
  map: GraphMap;
}) {
  if (myHand.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Cards ({myHand.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {myHand.map((c) => {
            const sel = selectedCardIds.has(c.cardId);
            const tName = c.territoryId
              ? map.territories[c.territoryId]?.name ?? c.territoryId
              : null;
            return (
              <button
                key={c.cardId}
                onClick={() => toggleCard(c.cardId)}
                className={`rounded-md border px-2 py-1 text-xs transition-all ${
                  sel
                    ? "ring-2 ring-primary border-primary bg-primary/10"
                    : "border-border hover:border-foreground/30"
                }`}
              >
                <span className="font-bold">{c.kind}</span>
                {tName && (
                  <span className="ml-1 text-muted-foreground">{tName}</span>
                )}
              </button>
            );
          })}
        </div>
        {selectedCardIds.size === 3 && (
          <Button
            size="sm"
            disabled={disabled || !canTrade}
            onClick={onTrade}
          >
            Trade Selected Cards
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function formatEvent(
  event: Record<string, unknown>,
  playerMap: Array<{
    displayName: string;
    enginePlayerId: string | null;
  }>,
): string {
  const pName = (pid: string) =>
    playerMap.find((p) => p.enginePlayerId === pid)?.displayName ?? pid;
  const type = event.type as string;
  switch (type) {
    case "ReinforcementsPlaced":
      return `${pName(event.playerId as string)} placed ${event.count} armies on ${event.territoryId}`;
    case "AttackResolved":
      return `Attack ${event.from} → ${event.to}: atk lost ${event.attackerLosses}, def lost ${event.defenderLosses} [${(event.attackRolls as number[]).join(",")} vs ${(event.defendRolls as number[]).join(",")}]`;
    case "TerritoryCaptured":
      return `${pName(event.newOwnerId as string)} captured ${event.to}`;
    case "OccupyResolved":
      return `Moved ${event.moved} armies ${event.from} → ${event.to}`;
    case "FortifyResolved":
      return `Fortified ${event.moved} armies ${event.from} → ${event.to}`;
    case "PlayerEliminated":
      return `${pName(event.eliminatedId as string)} eliminated!`;
    case "GameEnded":
      return event.winningPlayerId
        ? `${pName(event.winningPlayerId as string)} wins!`
        : "Game over!";
    case "TurnEnded":
      return `${pName(event.playerId as string)} ended turn`;
    case "TurnAdvanced":
      return `${pName(event.nextPlayerId as string)}'s turn (round ${event.round})`;
    case "ReinforcementsGranted":
      return `${pName(event.playerId as string)} gets ${event.amount} reinforcements`;
    case "CardsTraded":
      return `${pName(event.playerId as string)} traded cards for ${event.value} armies`;
    case "CardDrawn":
      return `${pName(event.playerId as string)} drew a card`;
    default:
      return type;
  }
}

function EventLog({
  gameId,
  playerMap,
}: {
  gameId: Id<"games">;
  playerMap: Array<{
    displayName: string;
    enginePlayerId: string | null;
  }>;
}) {
  const actions = useQuery(api.gameplay.listRecentActions, {
    gameId,
    limit: 30,
  });
  if (!actions) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Event Log</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground max-h-48 overflow-y-auto">
          {actions.length === 0 && <p>No actions yet</p>}
          {actions.map((a) => (
            <div key={a._id} className="flex flex-col">
              {(a.events as Record<string, unknown>[]).map(
                (ev: Record<string, unknown>, i: number) => (
                  <p key={i}>{formatEvent(ev, playerMap)}</p>
                ),
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function GamePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  const typedGameId = gameId as Id<"games"> | undefined;

  const playerView = useQuery(
    api.games.getGameViewAsPlayer,
    session && typedGameId ? { gameId: typedGameId } : "skip",
  );
  const publicView = useQuery(
    api.games.getGameView,
    typedGameId ? { gameId: typedGameId } : "skip",
  );

  const view = playerView ?? publicView;
  const myEnginePlayerId =
    playerView && "myEnginePlayerId" in playerView
      ? playerView.myEnginePlayerId
      : null;
  const myHand: HandCard[] | null =
    playerView && "myHand" in playerView
      ? (playerView.myHand as HandCard[] | null)
      : null;

  const mapDoc = useQuery(
    api.maps.getByMapId,
    view?.mapId ? { mapId: view.mapId } : "skip",
  );
  const graphMap = mapDoc?.graphMap as unknown as GraphMap | undefined;
  const mapVisual = mapDoc?.visual as unknown as MapVisual | undefined;
  const mapImageUrl =
    mapDoc && "imageUrl" in mapDoc
      ? (mapDoc.imageUrl as string | null)
      : null;

  const submitActionMutation = useMutation(api.gameplay.submitAction);
  const resignMutation = useMutation(api.gameplay.resign);

  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);
  const [selectedTo, setSelectedTo] = useState<string | null>(null);
  const [reinforceCount, setReinforceCount] = useState(1);
  const [attackDice, setAttackDice] = useState(3);
  const [occupyMove, setOccupyMove] = useState(1);
  const [fortifyCount, setFortifyCount] = useState(1);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(
    new Set(),
  );
  const [submitting, setSubmitting] = useState(false);

  const state = view?.state as PublicState | null | undefined;

  const isMyTurn =
    !!myEnginePlayerId &&
    !!state &&
    state.turn.currentPlayerId === myEnginePlayerId;
  const isSpectator = !myEnginePlayerId;
  const controlsDisabled = !isMyTurn || submitting || isSpectator;

  const submitAction = useCallback(
    async (action: Action) => {
      if (!typedGameId || !state) return;
      setSubmitting(true);
      try {
        await submitActionMutation({
          gameId: typedGameId,
          expectedVersion: state.stateVersion,
          action,
        });
        setSelectedFrom(null);
        setSelectedTo(null);
        setReinforceCount(1);
        setFortifyCount(1);
        setSelectedCardIds(new Set());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed");
      } finally {
        setSubmitting(false);
      }
    },
    [typedGameId, state, submitActionMutation],
  );

  const validFromIds = useMemo(() => {
    const ids = new Set<string>();
    if (!state || !myEnginePlayerId || !graphMap) return ids;
    const phase = state.turn.phase;
    if (phase === "Reinforcement") {
      for (const [tid, t] of Object.entries(state.territories)) {
        if (t.ownerId === myEnginePlayerId) ids.add(tid);
      }
    } else if (phase === "Attack") {
      for (const [tid, t] of Object.entries(state.territories)) {
        if (t.ownerId === myEnginePlayerId && t.armies >= 2) ids.add(tid);
      }
    } else if (phase === "Fortify") {
      for (const [tid, t] of Object.entries(state.territories)) {
        if (t.ownerId === myEnginePlayerId && t.armies >= 2) ids.add(tid);
      }
    }
    return ids;
  }, [state, myEnginePlayerId, graphMap]);

  const validToIds = useMemo(() => {
    const ids = new Set<string>();
    if (!state || !myEnginePlayerId || !graphMap || !selectedFrom) return ids;
    const phase = state.turn.phase;
    if (phase === "Attack") {
      const neighbors = graphMap.adjacency[selectedFrom];
      if (neighbors) {
        for (const nid of neighbors) {
          const t = state.territories[nid];
          if (t && t.ownerId !== myEnginePlayerId && t.ownerId !== "neutral" || (t && t.ownerId === "neutral")) {
            if (t && t.ownerId !== myEnginePlayerId) ids.add(nid);
          }
        }
      }
    } else if (phase === "Fortify") {
      for (const [tid, t] of Object.entries(state.territories)) {
        if (
          tid !== selectedFrom &&
          t.ownerId === myEnginePlayerId
        ) {
          ids.add(tid);
        }
      }
    }
    return ids;
  }, [state, myEnginePlayerId, graphMap, selectedFrom]);

  const handleClickTerritory = useCallback(
    (tid: string) => {
      if (!state || controlsDisabled) return;
      const phase = state.turn.phase;

      if (phase === "Reinforcement") {
        if (validFromIds.has(tid)) {
          setSelectedFrom(tid);
          setReinforceCount(1);
        }
      } else if (phase === "Attack") {
        if (!selectedFrom) {
          if (validFromIds.has(tid)) {
            setSelectedFrom(tid);
            setSelectedTo(null);
          }
        } else if (tid === selectedFrom) {
          setSelectedFrom(null);
          setSelectedTo(null);
        } else if (validToIds.has(tid)) {
          setSelectedTo(tid);
          const fromArmies = state.territories[selectedFrom]?.armies ?? 0;
          setAttackDice(Math.min(3, fromArmies - 1));
        } else if (validFromIds.has(tid)) {
          setSelectedFrom(tid);
          setSelectedTo(null);
        }
      } else if (phase === "Fortify") {
        if (!selectedFrom) {
          if (validFromIds.has(tid)) {
            setSelectedFrom(tid);
            setSelectedTo(null);
          }
        } else if (tid === selectedFrom) {
          setSelectedFrom(null);
          setSelectedTo(null);
        } else if (validToIds.has(tid)) {
          setSelectedTo(tid);
          setFortifyCount(1);
        } else if (validFromIds.has(tid)) {
          setSelectedFrom(tid);
          setSelectedTo(null);
        }
      }
    },
    [state, controlsDisabled, validFromIds, validToIds, selectedFrom],
  );

  const toggleCard = useCallback(
    (cardId: string) => {
      setSelectedCardIds((prev) => {
        const next = new Set(prev);
        if (next.has(cardId)) {
          next.delete(cardId);
        } else if (next.size < 3) {
          next.add(cardId);
        }
        return next;
      });
    },
    [],
  );

  const handleTrade = useCallback(() => {
    if (selectedCardIds.size !== 3) return;
    submitAction({
      type: "TradeCards",
      cardIds: Array.from(selectedCardIds) as CardId[],
    });
  }, [selectedCardIds, submitAction]);

  const handleResign = useCallback(async () => {
    if (!typedGameId) return;
    if (!confirm("Are you sure you want to resign?")) return;
    try {
      await resignMutation({ gameId: typedGameId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resign failed");
    }
  }, [typedGameId, resignMutation]);

  // Loading / not found states
  if (!typedGameId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Invalid game URL</p>
      </div>
    );
  }

  if (
    view === undefined ||
    graphMap === undefined ||
    mapVisual === undefined
  ) {
    if (view !== undefined && mapDoc === null) {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Map is unavailable</p>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading game...</p>
      </div>
    );
  }

  if (view === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Game not found</p>
      </div>
    );
  }

  if (!state || !graphMap || !mapVisual) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Waiting for game state...</p>
      </div>
    );
  }

  const playerMap = view.players;
  const phase = state.turn.phase;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-lg font-semibold hover:underline"
          >
            Risk
          </button>
          <span className="text-sm text-muted-foreground">{view.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {isSpectator && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
              Spectating
            </span>
          )}
          {!isSpectator && (
            <Button size="xs" variant="ghost" onClick={handleResign}>
              Resign
            </Button>
          )}
        </div>
      </header>

      <div className="p-4">
        <div className="mb-3">
          <PlayerLegend state={state} playerMap={playerMap} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
          {/* Board */}
          <div className="overflow-auto">
            <MapCanvas
              map={graphMap}
              visual={mapVisual}
              imageUrl={mapImageUrl}
              territories={state.territories}
              turnOrder={state.turnOrder}
              selectedFrom={selectedFrom}
              selectedTo={selectedTo}
              validFromIds={isMyTurn ? validFromIds : new Set()}
              validToIds={isMyTurn ? validToIds : new Set()}
              interactive={isMyTurn}
              onClickTerritory={handleClickTerritory}
              getPlayerColor={getPlayerColor}
            />
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-3">
            <Card>
              <CardContent className="pt-4">
                <PhaseIndicator state={state} />
              </CardContent>
            </Card>

            {/* Action controls (only if it's my turn and not game over) */}
            {isMyTurn && phase !== "GameOver" && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  {phase === "Reinforcement" && (
                    <ReinforcementControls
                      state={state}
                      selectedFrom={selectedFrom}
                      count={reinforceCount}
                      setCount={setReinforceCount}
                      onSubmit={submitAction}
                      disabled={controlsDisabled}
                    />
                  )}
                  {phase === "Attack" && !state.pending && (
                    <AttackControls
                      selectedFrom={selectedFrom}
                      selectedTo={selectedTo}
                      state={state}
                      dice={attackDice}
                      setDice={setAttackDice}
                      onSubmit={submitAction}
                      disabled={controlsDisabled}
                    />
                  )}
                  {phase === "Occupy" && (
                    <OccupyControls
                      state={state}
                      moveArmies={occupyMove}
                      setMoveArmies={setOccupyMove}
                      onSubmit={submitAction}
                      disabled={controlsDisabled}
                    />
                  )}
                  {(phase === "Attack" && state.pending) && (
                    <OccupyControls
                      state={state}
                      moveArmies={occupyMove}
                      setMoveArmies={setOccupyMove}
                      onSubmit={submitAction}
                      disabled={controlsDisabled}
                    />
                  )}
                  {phase === "Fortify" && (
                    <FortifyControls
                      selectedFrom={selectedFrom}
                      selectedTo={selectedTo}
                      count={fortifyCount}
                      setCount={setFortifyCount}
                      state={state}
                      onSubmit={submitAction}
                      disabled={controlsDisabled}
                    />
                  )}
                </CardContent>
              </Card>
            )}

            {/* Game Over */}
            {phase === "GameOver" && (
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-lg font-bold">Game Over</p>
                  <p className="text-sm text-muted-foreground">
                    {state.turnOrder.find(
                      (pid) => state.players[pid]?.status === "alive",
                    )
                      ? `Winner: ${playerMap.find(
                          (p) =>
                            p.enginePlayerId ===
                            state.turnOrder.find(
                              (pid) =>
                                state.players[pid]?.status === "alive",
                            ),
                        )?.displayName ?? "Unknown"}`
                      : "No winner"}
                  </p>
                  <Button
                    className="mt-3"
                    onClick={() => navigate("/")}
                  >
                    Back to Home
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Cards panel */}
            {myHand && graphMap && (
              <CardsPanel
                myHand={myHand}
                selectedCardIds={selectedCardIds}
                toggleCard={toggleCard}
                onTrade={handleTrade}
                canTrade={
                  phase === "Reinforcement" && selectedCardIds.size === 3
                }
                disabled={controlsDisabled}
                map={graphMap}
              />
            )}

            {/* Event log */}
            <EventLog gameId={typedGameId} playerMap={playerMap} />
          </div>
        </div>
      </div>
    </div>
  );
}
