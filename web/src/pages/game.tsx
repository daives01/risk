import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Crown, Dice1, Flag, Shield, Swords, Users } from "lucide-react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import type { Action, CardId, GraphMap, Phase, TerritoryId } from "risk-engine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MapCanvas } from "@/components/game/map-canvas";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

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

type GameAction = {
  _id: string;
  index: number;
  events: Array<{ type: string; [key: string]: unknown }>;
};

const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#f97316", "#14b8a6"];
const NEUTRAL_COLOR = "#64748b";

const PHASE_COPY: Record<Phase, { title: string; description: string }> = {
  Setup: {
    title: "Setting Up",
    description: "Assign territories and prepare your opening position.",
  },
  Reinforcement: {
    title: "Reinforce",
    description: "Place all available armies on your owned territories.",
  },
  Attack: {
    title: "Attack",
    description: "Choose source and target territories to resolve battles.",
  },
  Occupy: {
    title: "Occupy",
    description: "Move armies into your newly captured territory.",
  },
  Fortify: {
    title: "Fortify",
    description: "Move armies between your territories, then end turn.",
  },
  GameOver: {
    title: "Game Over",
    description: "The match is complete.",
  },
};

function getPlayerColor(playerId: string, turnOrder: string[]) {
  if (playerId === "neutral") return NEUTRAL_COLOR;
  const idx = turnOrder.indexOf(playerId);
  return PLAYER_COLORS[idx % PLAYER_COLORS.length] ?? NEUTRAL_COLOR;
}

function getPlayerName(
  enginePlayerId: string,
  players: Array<{ displayName: string; enginePlayerId: string | null }>,
) {
  return players.find((player) => player.enginePlayerId === enginePlayerId)?.displayName ?? enginePlayerId;
}

function formatEvent(
  event: Record<string, unknown>,
  playerMap: Array<{ displayName: string; enginePlayerId: string | null }>,
) {
  const playerName = (id: unknown) =>
    typeof id === "string" ? getPlayerName(id, playerMap) : "Unknown";

  switch (event.type) {
    case "ReinforcementsPlaced":
      return `${playerName(event.playerId)} placed ${event.count} armies on ${event.territoryId}`;
    case "AttackResolved":
      return `${event.from} attacked ${event.to} (${event.attackerLosses}/${event.defenderLosses} losses)`;
    case "TerritoryCaptured":
      return `${playerName(event.newOwnerId)} captured ${event.to}`;
    case "OccupyResolved":
      return `${playerName(event.playerId)} moved ${event.moved} armies to ${event.to}`;
    case "FortifyResolved":
      return `${playerName(event.playerId)} fortified ${event.from} to ${event.to} (${event.moved})`;
    case "CardsTraded":
      return `${playerName(event.playerId)} traded cards for ${event.value} armies`;
    case "CardDrawn":
      return `${playerName(event.playerId)} drew a card`;
    case "TurnEnded":
      return `${playerName(event.playerId)} ended their turn`;
    case "TurnAdvanced":
      return `${playerName(event.nextPlayerId)} starts round ${event.round}`;
    case "PlayerEliminated":
      return `${playerName(event.eliminatedId)} was eliminated`;
    case "GameEnded":
      return `${playerName(event.winningPlayerId)} won the game`;
    case "ReinforcementsGranted":
      return `${playerName(event.playerId)} received ${event.amount} reinforcements`;
    default:
      return String(event.type ?? "Event");
  }
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
  const publicView = useQuery(api.games.getGameView, typedGameId ? { gameId: typedGameId } : "skip");

  const view = playerView ?? publicView;
  const myEnginePlayerId =
    playerView && "myEnginePlayerId" in playerView ? playerView.myEnginePlayerId : null;
  const myHand: HandCard[] | null =
    playerView && "myHand" in playerView ? (playerView.myHand as HandCard[] | null) : null;

  const mapDoc = useQuery(api.maps.getByMapId, view?.mapId ? { mapId: view.mapId } : "skip");
  const graphMap = mapDoc?.graphMap as GraphMap | undefined;
  const mapVisual = mapDoc?.visual as MapVisual | undefined;
  const mapImageUrl = mapDoc && "imageUrl" in mapDoc ? (mapDoc.imageUrl as string | null) : null;

  const recentActions = useQuery(
    api.gameplay.listRecentActions,
    typedGameId ? { gameId: typedGameId, limit: 40 } : "skip",
  ) as GameAction[] | undefined;

  const submitActionMutation = useMutation(api.gameplay.submitAction);
  const resignMutation = useMutation(api.gameplay.resign);

  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);
  const [selectedTo, setSelectedTo] = useState<string | null>(null);
  const [reinforceCount, setReinforceCount] = useState(1);
  const [attackDice, setAttackDice] = useState(3);
  const [occupyMove, setOccupyMove] = useState(1);
  const [fortifyCount, setFortifyCount] = useState(1);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const state = view?.state as PublicState | null | undefined;
  const isSpectator = !myEnginePlayerId;
  const isMyTurn = !!myEnginePlayerId && !!state && state.turn.currentPlayerId === myEnginePlayerId;
  const controlsDisabled = !isMyTurn || isSpectator || submitting;

  const playerMap = view?.players ?? [];

  const validFromIds = useMemo(() => {
    const ids = new Set<string>();
    if (!state || !myEnginePlayerId || !graphMap) return ids;

    if (state.turn.phase === "Reinforcement") {
      for (const [territoryId, territory] of Object.entries(state.territories)) {
        if (territory.ownerId === myEnginePlayerId) ids.add(territoryId);
      }
    }

    if (state.turn.phase === "Attack" || state.turn.phase === "Fortify") {
      for (const [territoryId, territory] of Object.entries(state.territories)) {
        if (territory.ownerId === myEnginePlayerId && territory.armies >= 2) ids.add(territoryId);
      }
    }

    return ids;
  }, [graphMap, myEnginePlayerId, state]);

  const validToIds = useMemo(() => {
    const ids = new Set<string>();
    if (!state || !myEnginePlayerId || !graphMap || !selectedFrom) return ids;

    if (state.turn.phase === "Attack") {
      const neighbors = graphMap.adjacency[selectedFrom] ?? [];
      for (const neighborId of neighbors) {
        const territory = state.territories[neighborId];
        if (territory && territory.ownerId !== myEnginePlayerId) ids.add(neighborId);
      }
    }

    if (state.turn.phase === "Fortify") {
      for (const [territoryId, territory] of Object.entries(state.territories)) {
        if (territoryId !== selectedFrom && territory.ownerId === myEnginePlayerId) {
          ids.add(territoryId);
        }
      }
    }

    return ids;
  }, [graphMap, myEnginePlayerId, selectedFrom, state]);

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
        setAttackDice(3);
        setOccupyMove(1);
        setFortifyCount(1);
        setSelectedCardIds(new Set());
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      } finally {
        setSubmitting(false);
      }
    },
    [state, submitActionMutation, typedGameId],
  );

  const handleTerritoryClick = useCallback(
    (territoryId: string) => {
      if (!state || controlsDisabled) return;

      if (state.turn.phase === "Reinforcement") {
        if (validFromIds.has(territoryId)) {
          setSelectedFrom(territoryId);
          setReinforceCount(1);
        }
        return;
      }

      if (state.turn.phase === "Attack") {
        if (!selectedFrom && validFromIds.has(territoryId)) {
          setSelectedFrom(territoryId);
          setSelectedTo(null);
          return;
        }

        if (territoryId === selectedFrom) {
          setSelectedFrom(null);
          setSelectedTo(null);
          return;
        }

        if (selectedFrom && validToIds.has(territoryId)) {
          setSelectedTo(territoryId);
          const armies = state.territories[selectedFrom]?.armies ?? 2;
          setAttackDice(Math.min(3, armies - 1));
          return;
        }

        if (validFromIds.has(territoryId)) {
          setSelectedFrom(territoryId);
          setSelectedTo(null);
        }
        return;
      }

      if (state.turn.phase === "Fortify") {
        if (!selectedFrom && validFromIds.has(territoryId)) {
          setSelectedFrom(territoryId);
          setSelectedTo(null);
          return;
        }

        if (territoryId === selectedFrom) {
          setSelectedFrom(null);
          setSelectedTo(null);
          return;
        }

        if (selectedFrom && validToIds.has(territoryId)) {
          setSelectedTo(territoryId);
          setFortifyCount(1);
          return;
        }

        if (validFromIds.has(territoryId)) {
          setSelectedFrom(territoryId);
          setSelectedTo(null);
        }
      }
    },
    [controlsDisabled, selectedFrom, state, validFromIds, validToIds],
  );

  const toggleCard = useCallback((cardId: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else if (next.size < 3) {
        next.add(cardId);
      }
      return next;
    });
  }, []);

  const handleTrade = useCallback(() => {
    if (selectedCardIds.size !== 3) return;
    void submitAction({
      type: "TradeCards",
      cardIds: Array.from(selectedCardIds) as CardId[],
    });
  }, [selectedCardIds, submitAction]);

  const handleResign = useCallback(async () => {
    if (!typedGameId) return;
    if (!confirm("Are you sure you want to resign this game?")) return;
    try {
      await resignMutation({ gameId: typedGameId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resign");
    }
  }, [resignMutation, typedGameId]);

  const winnerId = state?.turnOrder.find((playerId) => state.players[playerId]?.status === "alive") ?? null;

  const playerStats = useMemo(() => {
    if (!state) return [];

    const territoryCounts: Record<string, number> = {};
    const armyCounts: Record<string, number> = {};

    for (const territory of Object.values(state.territories)) {
      territoryCounts[territory.ownerId] = (territoryCounts[territory.ownerId] ?? 0) + 1;
      armyCounts[territory.ownerId] = (armyCounts[territory.ownerId] ?? 0) + territory.armies;
    }

    return state.turnOrder.map((playerId) => ({
      playerId,
      territories: territoryCounts[playerId] ?? 0,
      armies: armyCounts[playerId] ?? 0,
      cards: state.handSizes[playerId] ?? 0,
      status: state.players[playerId]?.status ?? "alive",
    }));
  }, [state]);

  const flattenedEvents = useMemo(() => {
    if (!recentActions) return [];
    const events: Array<{ key: string; text: string }> = [];
    for (const action of recentActions) {
      for (const [index, event] of action.events.entries()) {
        events.push({
          key: `${action._id}-${index}`,
          text: formatEvent(event, playerMap),
        });
      }
    }
    return events.slice(-40).reverse();
  }, [playerMap, recentActions]);

  if (!typedGameId) {
    return <div className="page-shell flex items-center justify-center">Invalid game URL</div>;
  }

  if (view === undefined || graphMap === undefined || mapVisual === undefined) {
    return <div className="page-shell flex items-center justify-center">Loading game...</div>;
  }

  if (view === null) {
    return <div className="page-shell flex items-center justify-center">Game not found</div>;
  }

  if (!state || !graphMap || !mapVisual) {
    return <div className="page-shell flex items-center justify-center">Waiting for game state...</div>;
  }

  const phase = state.turn.phase;
  const phaseCopy = PHASE_COPY[phase] ?? PHASE_COPY.GameOver;
  const currentPlayerName = getPlayerName(state.turn.currentPlayerId, playerMap);

  return (
    <div className="page-shell soft-grid">
      <div className="page-container flex flex-col gap-4">
        <header className="glass-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="size-4" />
              Home
            </Button>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Live Match</p>
              <h1 className="hero-title text-xl">{view.name}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isSpectator && <span className="rounded-full border bg-muted px-3 py-1 text-xs">Spectating</span>}
            {!isSpectator && (
              <Button variant="outline" size="sm" onClick={handleResign}>
                <Flag className="size-4" />
                Resign
              </Button>
            )}
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex min-w-0 flex-col gap-4">
            <Card className="glass-panel overflow-hidden border-0 py-0">
              <CardHeader className="border-b border-border/60 bg-card/80 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <CardTitle className="text-xl">{phaseCopy.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{phaseCopy.description}</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border bg-background/70 px-3 py-2 text-sm">
                    <Crown className="size-4 text-primary" />
                    <span className="font-semibold">{currentPlayerName}</span>
                    <span className="text-muted-foreground">Round {state.turn.round}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-4">
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
                  onClickTerritory={handleTerritoryClick}
                  getPlayerColor={getPlayerColor}
                />
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border bg-background/80 px-3 py-2">Deck: {state.deckCount}</div>
                  <div className="rounded-lg border bg-background/80 px-3 py-2">Discard: {state.discardCount}</div>
                  <div className="rounded-lg border bg-background/80 px-3 py-2">
                    Captured this turn: {state.capturedThisTurn ? "Yes" : "No"}
                  </div>
                  <div className="rounded-lg border bg-background/80 px-3 py-2">Trades this turn: {state.tradesCompleted}</div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-0 py-0">
              <CardHeader className="py-4">
                <CardTitle className="text-base">Recent Events</CardTitle>
              </CardHeader>
              <CardContent className="max-h-64 space-y-2 overflow-y-auto pb-4 text-sm">
                {flattenedEvents.length === 0 && (
                  <p className="text-muted-foreground">No actions yet.</p>
                )}
                {flattenedEvents.map((event) => (
                  <p key={event.key} className="rounded-md border bg-background/80 px-3 py-2 text-muted-foreground">
                    {event.text}
                  </p>
                ))}
              </CardContent>
            </Card>
          </section>

          <aside className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
            <Card className="glass-panel border-0 py-0">
              <CardHeader className="py-4">
                <CardTitle className="text-base">Turn Controls</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pb-4">
                {!isMyTurn && phase !== "GameOver" && (
                  <p className="rounded-lg border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
                    Waiting for {currentPlayerName} to play.
                  </p>
                )}

                {isMyTurn && phase === "Reinforcement" && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Select a territory and place armies ({state.reinforcements?.remaining ?? 0} left).
                    </p>
                    {selectedFrom && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={state.reinforcements?.remaining ?? 1}
                          value={reinforceCount}
                          onChange={(event) => setReinforceCount(Math.max(1, Number(event.target.value) || 1))}
                          className="w-24"
                        />
                        <Button
                          disabled={controlsDisabled}
                          onClick={() => submitAction({
                            type: "PlaceReinforcements",
                            territoryId: selectedFrom as TerritoryId,
                            count: reinforceCount,
                          })}
                        >
                          <Shield className="size-4" />
                          Place
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {isMyTurn && phase === "Attack" && !state.pending && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Pick your attacking and target territories.
                    </p>
                    {selectedFrom && selectedTo && (
                      <div className="space-y-2 rounded-lg border bg-background/70 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Attacker dice</span>
                          <div className="flex gap-1">
                            {[1, 2, 3].map((dice) => {
                              const maxDice = Math.min(3, (state.territories[selectedFrom]?.armies ?? 2) - 1);
                              return (
                                <Button
                                  key={dice}
                                  type="button"
                                  size="xs"
                                  variant={attackDice === dice ? "default" : "outline"}
                                  disabled={dice > maxDice}
                                  onClick={() => setAttackDice(dice)}
                                >
                                  {dice}
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                        <Button
                          className="w-full"
                          disabled={controlsDisabled}
                          onClick={() => submitAction({
                            type: "Attack",
                            from: selectedFrom as TerritoryId,
                            to: selectedTo as TerritoryId,
                            attackerDice: attackDice,
                          })}
                        >
                          <Swords className="size-4" />
                          Resolve Attack
                        </Button>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={controlsDisabled}
                      onClick={() => submitAction({ type: "EndAttackPhase" })}
                    >
                      End Attack Phase
                    </Button>
                  </>
                )}

                {isMyTurn && (phase === "Occupy" || (phase === "Attack" && !!state.pending)) && state.pending && (
                  (() => {
                    const pending = state.pending;
                    return (
                      <>
                    <p className="text-sm text-muted-foreground">
                      Move armies from {pending.from} to {pending.to}.
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={pending.minMove}
                        max={pending.maxMove}
                        value={occupyMove}
                        onChange={(event) => {
                          const value = Number(event.target.value) || pending.minMove;
                          setOccupyMove(Math.max(pending.minMove, Math.min(pending.maxMove, value)));
                        }}
                        className="w-24"
                      />
                      <Button
                        disabled={controlsDisabled}
                        onClick={() => submitAction({ type: "Occupy", moveArmies: occupyMove })}
                      >
                        Confirm Move
                      </Button>
                    </div>
                      </>
                    );
                  })()
                )}

                {isMyTurn && phase === "Fortify" && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Select source and destination territories.
                    </p>
                    {selectedFrom && selectedTo && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={Math.max(1, (state.territories[selectedFrom]?.armies ?? 2) - 1)}
                          value={fortifyCount}
                          onChange={(event) => setFortifyCount(Math.max(1, Number(event.target.value) || 1))}
                          className="w-24"
                        />
                        <Button
                          disabled={controlsDisabled}
                          onClick={() => submitAction({
                            type: "Fortify",
                            from: selectedFrom as TerritoryId,
                            to: selectedTo as TerritoryId,
                            count: fortifyCount,
                          })}
                        >
                          Fortify
                        </Button>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      disabled={controlsDisabled}
                      onClick={() => submitAction({ type: "EndTurn" })}
                    >
                      End Turn
                    </Button>
                  </>
                )}

                {phase === "GameOver" && (
                  <div className="rounded-lg border bg-background/70 px-3 py-3 text-sm">
                    Winner: {winnerId ? getPlayerName(winnerId, playerMap) : "Unknown"}
                  </div>
                )}
              </CardContent>
            </Card>

            {myHand && (
              <Card className="glass-panel border-0 py-0">
                <CardHeader className="py-4">
                  <CardTitle className="text-base">Cards ({myHand.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pb-4">
                  <div className="flex flex-wrap gap-2">
                    {myHand.map((card) => {
                      const selected = selectedCardIds.has(card.cardId);
                      return (
                        <button
                          key={card.cardId}
                          type="button"
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                            selected
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border bg-background/80 hover:border-primary/50"
                          }`}
                          onClick={() => toggleCard(card.cardId)}
                        >
                          {card.kind}
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    className="w-full"
                    disabled={controlsDisabled || phase !== "Reinforcement" || selectedCardIds.size !== 3}
                    onClick={handleTrade}
                  >
                    Trade Selected Cards
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card className="glass-panel border-0 py-0">
              <CardHeader className="py-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4" />
                  Players
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pb-4">
                {playerStats.map((player) => {
                  const isCurrent = player.playerId === state.turn.currentPlayerId;
                  const isDefeated = player.status === "defeated";
                  const color = getPlayerColor(player.playerId, state.turnOrder);

                  return (
                    <div
                      key={player.playerId}
                      className={`rounded-lg border px-3 py-2 ${isCurrent ? "border-primary/70 bg-primary/10" : "bg-background/80"} ${
                        isDefeated ? "opacity-55" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                          <span className={`text-sm font-semibold ${isDefeated ? "line-through" : ""}`}>
                            {getPlayerName(player.playerId, playerMap)}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {player.territories}T / {player.armies}A / {player.cards}C
                        </span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="glass-panel border-0 py-0">
              <CardContent className="grid grid-cols-3 gap-2 py-4 text-center text-xs">
                <div className="rounded-lg border bg-background/70 p-2">
                  <Dice1 className="mx-auto mb-1 size-4 text-primary" />
                  <p className="text-muted-foreground">Phase</p>
                  <p className="font-semibold">{phase}</p>
                </div>
                <div className="rounded-lg border bg-background/70 p-2">
                  <Crown className="mx-auto mb-1 size-4 text-primary" />
                  <p className="text-muted-foreground">Turn</p>
                  <p className="font-semibold">{state.turn.round}</p>
                </div>
                <div className="rounded-lg border bg-background/70 p-2">
                  <Flag className="mx-auto mb-1 size-4 text-primary" />
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-semibold">{phase === "GameOver" ? "Final" : "Live"}</p>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
