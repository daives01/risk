import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { Flag, Pause, Play, Shield, SkipBack, SkipForward, Users } from "lucide-react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import type { Action, CardId, GraphMap, Phase, TerritoryId } from "risk-engine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
type ReinforcementDraft = { territoryId: string; count: number };
type HistoryFrame = {
  index: number;
  actionType: string;
  label: string;
  state: PublicState;
};

const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#f97316", "#14b8a6"];
const NEUTRAL_COLOR = "#64748b";

const PHASE_COPY: Record<Phase, { title: string; description: string }> = {
  Setup: {
    title: "Setting Up",
    description: "Assign territories and prepare your opening position.",
  },
  Reinforcement: {
    title: "Place",
    description: "Set a placement count, click territories to queue placements, then confirm.",
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
  const historyTimeline = useQuery(
    api.gameplay.getHistoryTimeline,
    typedGameId ? { gameId: typedGameId, limit: 500 } : "skip",
  ) as HistoryFrame[] | undefined;

  const submitActionMutation = useMutation(api.gameplay.submitAction);
  const submitReinforcementPlacementsMutation = useMutation(api.gameplay.submitReinforcementPlacements);
  const resignMutation = useMutation(api.gameplay.resign);

  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);
  const [selectedTo, setSelectedTo] = useState<string | null>(null);
  const [placeCount, setPlaceCount] = useState(1);
  const [attackDice, setAttackDice] = useState(3);
  const [occupyMove, setOccupyMove] = useState(1);
  const [fortifyCount, setFortifyCount] = useState(1);
  const [reinforcementDrafts, setReinforcementDrafts] = useState<ReinforcementDraft[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPlaying, setHistoryPlaying] = useState(false);
  const [historyFrameIndex, setHistoryFrameIndex] = useState(0);

  const state = view?.state as PublicState | null | undefined;
  const phase = state?.turn.phase ?? "GameOver";
  const isSpectator = !myEnginePlayerId;
  const isMyTurn = !!myEnginePlayerId && !!state && state.turn.currentPlayerId === myEnginePlayerId;
  const controlsDisabled = !isMyTurn || isSpectator || submitting || historyOpen;
  const historyCount = historyTimeline?.length ?? 0;
  const historyMaxIndex = Math.max(0, historyCount - 1);
  const historyAtEnd = historyFrameIndex >= historyMaxIndex;

  const playerMap = view?.players ?? [];
  const queuedReinforcementTotal = useMemo(
    () => reinforcementDrafts.reduce((sum, draft) => sum + draft.count, 0),
    [reinforcementDrafts],
  );
  const remainingReinforcements = state?.reinforcements?.remaining ?? 0;
  const uncommittedReinforcements = Math.max(0, remainingReinforcements - queuedReinforcementTotal);
  const isPlacementPhase = state?.turn.phase === "Reinforcement";

  const displayedTerritories = useMemo(() => {
    if (!state) return {};
    if (!isPlacementPhase || reinforcementDrafts.length === 0) return state.territories;

    const draftByTerritory: Record<string, number> = {};
    for (const draft of reinforcementDrafts) {
      draftByTerritory[draft.territoryId] = (draftByTerritory[draft.territoryId] ?? 0) + draft.count;
    }

    const nextTerritories = { ...state.territories };
    for (const [territoryId, bonusArmies] of Object.entries(draftByTerritory)) {
      const territory = nextTerritories[territoryId];
      if (!territory) continue;
      nextTerritories[territoryId] = { ...territory, armies: territory.armies + bonusArmies };
    }
    return nextTerritories;
  }, [isPlacementPhase, reinforcementDrafts, state]);

  const validFromIds = useMemo(() => {
    const ids = new Set<string>();
    if (!state || !myEnginePlayerId || !graphMap) return ids;

    if (state.turn.phase === "Reinforcement") {
      if (uncommittedReinforcements <= 0) return ids;
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
  }, [graphMap, myEnginePlayerId, state, uncommittedReinforcements]);

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
        setPlaceCount(1);
        setReinforcementDrafts([]);
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
        if (validFromIds.has(territoryId) && uncommittedReinforcements > 0) {
          const queuedCount = Math.min(placeCount, uncommittedReinforcements);
          setReinforcementDrafts((prev) => [...prev, { territoryId, count: queuedCount }]);
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
    [controlsDisabled, placeCount, selectedFrom, state, uncommittedReinforcements, validFromIds, validToIds],
  );

  const handleUndoPlacement = useCallback(() => {
    setReinforcementDrafts((prev) => prev.slice(0, -1));
  }, []);

  const handleUndoAllPlacements = useCallback(() => {
    setReinforcementDrafts([]);
  }, []);

  const handleConfirmPlacements = useCallback(async () => {
    if (!typedGameId || !state || reinforcementDrafts.length === 0) return;
    setSubmitting(true);
    try {
      await submitReinforcementPlacementsMutation({
        gameId: typedGameId,
        expectedVersion: state.stateVersion,
        placements: reinforcementDrafts,
      });
      setReinforcementDrafts([]);
      setPlaceCount(1);
      setSelectedFrom(null);
      setSelectedTo(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not confirm placements");
    } finally {
      setSubmitting(false);
    }
  }, [reinforcementDrafts, state, submitReinforcementPlacementsMutation, typedGameId]);

  useEffect(() => {
    if (!isPlacementPhase || !isMyTurn) {
      setReinforcementDrafts([]);
      setPlaceCount(1);
    }
  }, [isMyTurn, isPlacementPhase, state?.stateVersion]);

  useEffect(() => {
    const maxAllowed = Math.max(1, uncommittedReinforcements);
    setPlaceCount((prev) => Math.max(1, Math.min(prev, maxAllowed)));
  }, [uncommittedReinforcements]);

  useEffect(() => {
    const pending = state?.pending;
    if (!pending) return;
    setOccupyMove((prev) => Math.max(pending.minMove, Math.min(pending.maxMove, prev)));
  }, [state?.pending]);

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

  const handleResolveAttack = useCallback(() => {
    if (!selectedFrom || !selectedTo) return;
    void submitAction({
      type: "Attack",
      from: selectedFrom as TerritoryId,
      to: selectedTo as TerritoryId,
      attackerDice: attackDice,
    });
  }, [attackDice, selectedFrom, selectedTo, submitAction]);

  const handleEndAttackPhase = useCallback(() => {
    void submitAction({ type: "EndAttackPhase" });
  }, [submitAction]);

  const handleEndTurn = useCallback(() => {
    void submitAction({ type: "EndTurn" });
  }, [submitAction]);

  const handleResign = useCallback(async () => {
    if (!typedGameId) return;
    if (!confirm("Are you sure you want to resign this game?")) return;
    try {
      await resignMutation({ gameId: typedGameId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not resign");
    }
  }, [resignMutation, typedGameId]);

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

  useEffect(() => {
    if (!historyOpen) {
      setHistoryPlaying(false);
      return;
    }
    const maxIndex = Math.max(0, (historyTimeline?.length ?? 1) - 1);
    setHistoryFrameIndex((prev) => Math.min(prev, maxIndex));
  }, [historyOpen, historyTimeline?.length]);

  useEffect(() => {
    if (!historyOpen || !historyPlaying) return;
    const maxIndex = (historyTimeline?.length ?? 0) - 1;
    if (maxIndex <= 0) return;
    const timer = setInterval(() => {
      setHistoryFrameIndex((prev) => {
        if (prev >= maxIndex) {
          setHistoryPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 700);
    return () => clearInterval(timer);
  }, [historyOpen, historyPlaying, historyTimeline]);

  useEffect(() => {
    if (!historyOpen) return;
    setSelectedFrom(null);
    setSelectedTo(null);
  }, [historyOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (isTyping) return;

      const key = event.key.toLowerCase();
      const withCommand = event.metaKey || event.ctrlKey;

      if (event.key === "Escape") {
        setSelectedFrom(null);
        setSelectedTo(null);
        return;
      }

      if (!withCommand) {
        if (key === "h") {
          event.preventDefault();
          setHistoryOpen((prev) => !prev);
          setHistoryPlaying(false);
          return;
        }

        if (historyOpen) {
          if (event.key === "[") {
            event.preventDefault();
            setHistoryFrameIndex((prev) => Math.max(0, prev - 1));
            return;
          }
          if (event.key === "]") {
            event.preventDefault();
            setHistoryFrameIndex((prev) => Math.min(historyMaxIndex, prev + 1));
            return;
          }
          if (key === "p" && !historyAtEnd) {
            event.preventDefault();
            setHistoryPlaying((prev) => !prev);
            return;
          }
          if (key === "r") {
            event.preventDefault();
            setHistoryFrameIndex(0);
            setHistoryPlaying(false);
            return;
          }
        }

        if (!historyOpen && isMyTurn && phase === "Reinforcement") {
          if (key === "u" && reinforcementDrafts.length > 0) {
            event.preventDefault();
            handleUndoPlacement();
            return;
          }
          if (key === "c" && reinforcementDrafts.length > 0 && !controlsDisabled) {
            event.preventDefault();
            void handleConfirmPlacements();
            return;
          }
        }
        return;
      }

      if (!historyOpen && isMyTurn && phase === "Attack" && !state.pending && key === "e") {
        event.preventDefault();
        handleEndAttackPhase();
        return;
      }

      if (!historyOpen && isMyTurn && phase === "Fortify" && event.key === "Enter") {
        event.preventDefault();
        handleEndTurn();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    controlsDisabled,
    handleConfirmPlacements,
    handleEndAttackPhase,
    handleEndTurn,
    handleUndoPlacement,
    historyAtEnd,
    historyMaxIndex,
    historyOpen,
    isMyTurn,
    phase,
    reinforcementDrafts.length,
    state?.pending,
  ]);

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

  const activeHistoryFrame = historyOpen ? historyTimeline?.[historyFrameIndex] ?? null : null;
  const displayState = activeHistoryFrame?.state ?? state;
  const displayPhase = displayState.turn.phase;
  const phaseLabel = displayPhase === "Reinforcement" ? "Place" : displayPhase;
  const phaseCopy = PHASE_COPY[displayPhase] ?? PHASE_COPY.GameOver;
  const winnerId = displayState.turnOrder.find((playerId) => displayState.players[playerId]?.status === "alive") ?? null;
  const playbackTerritories = historyOpen ? displayState.territories : displayedTerritories;

  const playerStats = (() => {
    const territoryCounts: Record<string, number> = {};
    const armyCounts: Record<string, number> = {};

    for (const territory of Object.values(displayState.territories)) {
      territoryCounts[territory.ownerId] = (territoryCounts[territory.ownerId] ?? 0) + 1;
      armyCounts[territory.ownerId] = (armyCounts[territory.ownerId] ?? 0) + territory.armies;
    }

    return displayState.turnOrder.map((playerId) => ({
      playerId,
      territories: territoryCounts[playerId] ?? 0,
      armies: armyCounts[playerId] ?? 0,
      cards: displayState.handSizes[playerId] ?? 0,
      status: displayState.players[playerId]?.status ?? "alive",
    }));
  })();

  return (
    <div className="page-shell soft-grid overflow-x-hidden">
      <div className="page-container max-w-none flex min-h-[calc(100vh-2rem)] flex-col gap-1">
        <div className="glass-panel flex min-h-12 items-center gap-2 overflow-x-auto px-2 py-1.5">
          <span className="shrink-0 rounded border bg-background/70 px-2 py-1 text-sm font-semibold">{phaseCopy.title}</span>

          {!historyOpen && isMyTurn && phase === "Reinforcement" && (
            <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm">
              <Button
                size="xs"
                type="button"
                variant="outline"
                disabled={controlsDisabled || uncommittedReinforcements <= 0 || placeCount <= 1}
                onClick={() => setPlaceCount((prev) => Math.max(1, prev - 1))}
              >
                -
              </Button>
              <span className="inline-flex min-w-8 items-center justify-center rounded border bg-background/80 px-2 py-1 font-semibold">
                {placeCount}
              </span>
              <Button
                size="xs"
                type="button"
                variant="outline"
                disabled={controlsDisabled || uncommittedReinforcements <= 0 || placeCount >= uncommittedReinforcements}
                onClick={() => setPlaceCount((prev) => Math.min(Math.max(1, uncommittedReinforcements), prev + 1))}
              >
                +
              </Button>
              <span className="text-xs text-muted-foreground">{uncommittedReinforcements}</span>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={controlsDisabled || reinforcementDrafts.length === 0}
                onClick={handleUndoPlacement}
              >
                Undo
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={controlsDisabled || reinforcementDrafts.length === 0}
                onClick={handleUndoAllPlacements}
              >
                Undo All
              </Button>
              <Button
                type="button"
                size="xs"
                disabled={controlsDisabled || reinforcementDrafts.length === 0}
                onClick={handleConfirmPlacements}
              >
                <Shield className="size-4" />
                Confirm
              </Button>
              <span className="text-xs text-muted-foreground">{queuedReinforcementTotal}</span>
            </div>
          )}

          {!historyOpen && isMyTurn && phase === "Attack" && !state.pending && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              title="End attack phase (Cmd/Ctrl+E)"
              disabled={controlsDisabled}
              onClick={handleEndAttackPhase}
              className="shrink-0"
            >
              End Attack
            </Button>
          )}

          {!historyOpen && isMyTurn && phase === "Fortify" && (
            <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
              <Button
                size="sm"
                variant="outline"
                title="End turn (Cmd/Ctrl+Enter)"
                disabled={controlsDisabled}
                onClick={handleEndTurn}
              >
                End Turn
              </Button>
            </div>
          )}

          {displayPhase === "GameOver" && (
            <span className="shrink-0 rounded border bg-background/70 px-2 py-1 text-sm">
              {winnerId ? getPlayerName(winnerId, playerMap) : "Unknown"}
            </span>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {!isSpectator && (
              <Button variant="outline" size="sm" onClick={handleResign} title="Resign game">
                <Flag className="size-4" />
                Resign
              </Button>
            )}
            <Button
              variant={historyOpen ? "default" : "outline"}
              size="sm"
              type="button"
              title="Toggle history (H)"
              onClick={() => {
                setHistoryOpen((prev) => !prev);
                setHistoryPlaying(false);
              }}
              disabled={historyCount === 0}
            >
              History
            </Button>
            {historyOpen && (
              <>
                <Button
                  size="xs"
                  type="button"
                  variant="outline"
                  title="Previous frame ([)"
                  disabled={historyFrameIndex <= 0}
                  onClick={() => setHistoryFrameIndex((prev) => Math.max(0, prev - 1))}
                >
                  <SkipBack className="size-4" />
                </Button>
                <Button
                  size="xs"
                  type="button"
                  variant="outline"
                  title="Play/Pause (P)"
                  disabled={historyAtEnd}
                  onClick={() => setHistoryPlaying((prev) => !prev)}
                >
                  {historyPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                </Button>
                <Button
                  size="xs"
                  type="button"
                  variant="outline"
                  title="Next frame (])"
                  disabled={historyAtEnd}
                  onClick={() => setHistoryFrameIndex((prev) => Math.min(historyMaxIndex, prev + 1))}
                >
                  <SkipForward className="size-4" />
                </Button>
                <Button
                  size="xs"
                  type="button"
                  variant="outline"
                  title="Reset history (R)"
                  onClick={() => {
                    setHistoryFrameIndex(0);
                    setHistoryPlaying(false);
                  }}
                >
                  Reset
                </Button>
                <span className="rounded border bg-background/70 px-2 py-1 text-xs text-muted-foreground">
                  {historyFrameIndex + 1}/{historyCount}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <Card className="glass-panel overflow-hidden border-0 py-0">
            <CardContent className="p-1 sm:p-2">
              <MapCanvas
                map={graphMap}
                visual={mapVisual}
                imageUrl={mapImageUrl}
                territories={playbackTerritories}
                turnOrder={displayState.turnOrder}
                selectedFrom={selectedFrom}
                selectedTo={selectedTo}
                validFromIds={!historyOpen && isMyTurn ? validFromIds : new Set()}
                validToIds={!historyOpen && isMyTurn ? validToIds : new Set()}
                interactive={!historyOpen && isMyTurn}
                onClickTerritory={handleTerritoryClick}
                onClearSelection={() => {
                  setSelectedFrom(null);
                  setSelectedTo(null);
                }}
                getPlayerColor={getPlayerColor}
                battleOverlay={
                  !historyOpen && isMyTurn && (phase === "Occupy" || (phase === "Attack" && !!state.pending)) && state.pending
                    ? {
                        mode: "occupy",
                        fromTerritoryId: state.pending.from,
                        toTerritoryId: state.pending.to,
                        fromLabel: graphMap.territories[state.pending.from]?.name ?? state.pending.from,
                        toLabel: graphMap.territories[state.pending.to]?.name ?? state.pending.to,
                        occupyMove,
                        minMove: state.pending.minMove,
                        maxMove: state.pending.maxMove,
                        disabled: controlsDisabled,
                        onSetOccupyMove: setOccupyMove,
                        onSubmitOccupy: () => {
                          void submitAction({ type: "Occupy", moveArmies: occupyMove });
                        },
                      }
                    : !historyOpen && isMyTurn && phase === "Fortify" && selectedFrom && selectedTo
                    ? {
                        mode: "fortify",
                        fromTerritoryId: selectedFrom,
                        toTerritoryId: selectedTo,
                        fromLabel: graphMap.territories[selectedFrom]?.name ?? selectedFrom,
                        toLabel: graphMap.territories[selectedTo]?.name ?? selectedTo,
                        fortifyCount,
                        minCount: 1,
                        maxCount: Math.max(1, (state.territories[selectedFrom]?.armies ?? 2) - 1),
                        disabled: controlsDisabled,
                        onSetFortifyCount: setFortifyCount,
                        onSubmitFortify: () => {
                          void submitAction({
                            type: "Fortify",
                            from: selectedFrom as TerritoryId,
                            to: selectedTo as TerritoryId,
                            count: fortifyCount,
                          });
                        },
                        onCancelSelection: () => {
                          setSelectedFrom(null);
                          setSelectedTo(null);
                        },
                      }
                    : !historyOpen && isMyTurn && phase === "Attack" && !state.pending && selectedFrom && selectedTo
                    ? {
                        mode: "attack",
                        fromTerritoryId: selectedFrom,
                        toTerritoryId: selectedTo,
                        fromLabel: graphMap.territories[selectedFrom]?.name ?? selectedFrom,
                        toLabel: graphMap.territories[selectedTo]?.name ?? selectedTo,
                        attackDice,
                        maxDice: Math.max(1, Math.min(3, (state.territories[selectedFrom]?.armies ?? 2) - 1)),
                        disabled: controlsDisabled,
                        onSetAttackDice: setAttackDice,
                        onResolveAttack: handleResolveAttack,
                        onCancelSelection: () => {
                          setSelectedFrom(null);
                          setSelectedTo(null);
                        },
                        onEndAttackPhase: handleEndAttackPhase,
                      }
                    : null
                }
              />
            </CardContent>
          </Card>

          <Card className="glass-panel border-0 py-0">
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4" />
                Players
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pb-4">
              {playerStats.map((player) => {
                const isCurrent = player.playerId === displayState.turn.currentPlayerId;
                const isDefeated = player.status === "defeated";
                const color = getPlayerColor(player.playerId, displayState.turnOrder);

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

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
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
                  <div className="rounded-lg border bg-background/80 px-3 py-2 text-xs text-muted-foreground">{phaseLabel}</div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
