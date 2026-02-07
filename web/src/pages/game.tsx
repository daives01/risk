import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { Flag, History, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { Id } from "@backend/_generated/dataModel";
import { defaultRuleset } from "risk-engine";
import type { Action, CardId, TerritoryId } from "risk-engine";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MapCanvas } from "@/components/game/map-canvas";
import { HistoryScrubber } from "@/components/game/history-scrubber";
import { GameChatCard, GameEventsCard, GamePlayersCard } from "@/components/game/game-panels";
import { authClient } from "@/lib/auth-client";
import { adaptMapDoc, adaptView } from "@/lib/game/adapters";
import { formatEvent, getPlayerColor, getPlayerName } from "@/lib/game/display";
import {
  resolveHighlightedTerritoryIds,
  togglePlayerHighlight,
  toggleTeamHighlight,
  type HighlightFilter,
} from "@/lib/game/highlighting";
import { buildPlayerPanelStats } from "@/lib/game/player-stats";
import { PHASE_COPY } from "@/lib/game/types";
import type { ChatMessage } from "@/lib/game/types";
import type { ChatChannel } from "@/lib/game/types";
import type { ReinforcementDraft } from "@/lib/game/types";
import { useGameActions } from "@/lib/game/use-game-actions";
import { useGameRuntimeQueries, useGameViewQueries } from "@/lib/game/use-game-queries";
import { useGameShortcuts } from "@/lib/game/use-game-shortcuts";
import { toast } from "sonner";

type TradeSetsConfig = {
  allowThreeOfAKind: boolean;
  allowOneOfEach: boolean;
  wildActsAsAny: boolean;
};

function isValidTradeSet(kinds: readonly string[], tradeSets: TradeSetsConfig): boolean {
  if (kinds.length !== 3) return false;

  const nonWildKinds = kinds.filter((kind) => kind !== "W");
  const wildCount = kinds.length - nonWildKinds.length;

  if (!tradeSets.wildActsAsAny && wildCount > 0) return false;

  if (tradeSets.allowThreeOfAKind) {
    const uniqueNonWild = new Set(nonWildKinds);
    if (uniqueNonWild.size <= 1) return true;
  }

  if (tradeSets.allowOneOfEach) {
    const uniqueNonWild = new Set(nonWildKinds);
    if (uniqueNonWild.size + wildCount >= 3 && uniqueNonWild.size === nonWildKinds.length) {
      return true;
    }
  }

  return false;
}

function findAutoTradeSet(
  hand: Array<{ cardId: string; kind: string }>,
  tradeSets: TradeSetsConfig,
): string[] | null {
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        const selected = [hand[i]!, hand[j]!, hand[k]!];
        if (isValidTradeSet(selected.map((card) => card.kind), tradeSets)) {
          return selected.map((card) => card.cardId);
        }
      }
    }
  }
  return null;
}

export default function GamePage() {
  const HISTORY_PLAYBACK_INTERVAL_MS = 840;
  const TROOP_DELTA_DURATION_MS = Math.round(HISTORY_PLAYBACK_INTERVAL_MS * 1.25);
  const { gameId } = useParams<{ gameId: string }>();
  const location = useLocation();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const typedGameId = gameId as Id<"games"> | undefined;
  const { playerView, publicView } = useGameViewQueries(session, typedGameId);
  const { view, myEnginePlayerId, myHand, playerMap, state } = adaptView(playerView, publicView);
  const [chatChannel, setChatChannel] = useState<ChatChannel>("global");
  const [chatDraft, setChatDraft] = useState("");
  const [chatEditingMessageId, setChatEditingMessageId] = useState<string | null>(null);
  const { mapDoc, recentActions, historyTimeline, chatMessages } = useGameRuntimeQueries(
    typedGameId,
    !!session,
    view?.mapId,
    chatChannel,
  );
  const { graphMap, mapVisual, mapImageUrl } = adaptMapDoc(mapDoc);
  const {
    submitActionMutation,
    submitReinforcementPlacementsMutation,
    resignMutation,
    sendGameChatMessageMutation,
    editGameChatMessageMutation,
    deleteGameChatMessageMutation,
  } = useGameActions();

  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);
  const [selectedTo, setSelectedTo] = useState<string | null>(null);
  const [placeCount, setPlaceCount] = useState(1);
  const [attackDice, setAttackDice] = useState(3);
  const [occupyMove, setOccupyMove] = useState(1);
  const [fortifyCount, setFortifyCount] = useState(1);
  const [reinforcementDrafts, setReinforcementDrafts] = useState<ReinforcementDraft[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [cardsOpen, setCardsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPlaying, setHistoryPlaying] = useState(false);
  const [historyFrameIndex, setHistoryFrameIndex] = useState(0);
  const [highlightFilter, setHighlightFilter] = useState<HighlightFilter>("none");

  const phase = state?.turn.phase ?? "GameOver";
  const isSpectator = !myEnginePlayerId;
  const isMyTurn = !!myEnginePlayerId && !!state && state.turn.currentPlayerId === myEnginePlayerId;
  const controlsDisabled = !isMyTurn || isSpectator || submitting || historyOpen;
  const historyFrames = useMemo(() => historyTimeline ?? [], [historyTimeline]);
  const historyCount = historyFrames.length;
  const historyMaxIndex = Math.max(0, historyCount - 1);
  const historyAtEnd = historyFrameIndex >= historyMaxIndex;

  const queuedReinforcementTotal = useMemo(
    () => reinforcementDrafts.reduce((sum, draft) => sum + draft.count, 0),
    [reinforcementDrafts],
  );
  const remainingReinforcements = state?.reinforcements?.remaining ?? 0;
  const uncommittedReinforcements = Math.max(0, remainingReinforcements - queuedReinforcementTotal);
  const isPlacementPhase = state?.turn.phase === "Reinforcement";
  const effectiveTeams = (view?.effectiveRuleset as {
    teams?: {
      allowPlaceOnTeammate?: boolean;
      allowFortifyWithTeammate?: boolean;
      preventAttackingTeammates?: boolean;
    };
  } | null)?.teams;
  const allowPlaceOnTeammate = effectiveTeams?.allowPlaceOnTeammate ?? true;
  const allowFortifyWithTeammate = effectiveTeams?.allowFortifyWithTeammate ?? true;
  const preventAttackingTeammates = effectiveTeams?.preventAttackingTeammates ?? false;
  const teamNames = (view?.teamNames as Record<string, string> | null) ?? {};
  const myTeamId = myEnginePlayerId && state ? state.players[myEnginePlayerId]?.teamId : undefined;
  const myTeamName = myTeamId ? teamNames[myTeamId] ?? myTeamId : null;
  const canUseTeamChat = !!view?.teamModeEnabled && !!myTeamId;
  const canSendChat = !isSpectator && !historyOpen && view?.status === "active";
  const isTeammateOwner = useCallback((ownerId: string) => {
    if (!state || !myEnginePlayerId || !myTeamId) return false;
    if (ownerId === myEnginePlayerId || ownerId === "neutral") return false;
    return state.players[ownerId]?.teamId === myTeamId;
  }, [myEnginePlayerId, myTeamId, state]);

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
        if (
          territory.ownerId === myEnginePlayerId ||
          (allowPlaceOnTeammate && isTeammateOwner(territory.ownerId))
        ) {
          ids.add(territoryId);
        }
      }
    }

    if (state.turn.phase === "Attack") {
      for (const [territoryId, territory] of Object.entries(state.territories)) {
        if (territory.ownerId === myEnginePlayerId && territory.armies >= 2) ids.add(territoryId);
      }
    }

    if (state.turn.phase === "Fortify") {
      for (const [territoryId, territory] of Object.entries(state.territories)) {
        if (
          (
            territory.ownerId === myEnginePlayerId ||
            (allowFortifyWithTeammate && isTeammateOwner(territory.ownerId))
          ) &&
          territory.armies >= 2
        ) {
          ids.add(territoryId);
        }
      }
    }

    return ids;
  }, [
    allowFortifyWithTeammate,
    allowPlaceOnTeammate,
    graphMap,
    isTeammateOwner,
    myEnginePlayerId,
    state,
    uncommittedReinforcements,
  ]);

  const validToIds = useMemo(() => {
    const ids = new Set<string>();
    if (!state || !myEnginePlayerId || !graphMap || !selectedFrom) return ids;

    if (state.turn.phase === "Attack") {
      const neighbors = graphMap.adjacency[selectedFrom] ?? [];
      for (const neighborId of neighbors) {
        const territory = state.territories[neighborId];
        if (!territory) continue;
        if (territory.ownerId === myEnginePlayerId) continue;
        if (preventAttackingTeammates && isTeammateOwner(territory.ownerId)) continue;
        ids.add(neighborId);
      }
    }

    if (state.turn.phase === "Fortify") {
      for (const [territoryId, territory] of Object.entries(state.territories)) {
        if (
          territoryId !== selectedFrom &&
          (
            territory.ownerId === myEnginePlayerId ||
            (allowFortifyWithTeammate && isTeammateOwner(territory.ownerId))
          )
        ) {
          ids.add(territoryId);
        }
      }
    }

    return ids;
  }, [allowFortifyWithTeammate, graphMap, isTeammateOwner, myEnginePlayerId, preventAttackingTeammates, selectedFrom, state]);

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

  const handleSendChatMessage = useCallback(async () => {
    if (!typedGameId) return;
    const text = chatDraft.trim();
    if (!text) return;
    try {
      if (chatEditingMessageId) {
        await editGameChatMessageMutation({
          messageId: chatEditingMessageId as Id<"gameChatMessages">,
          text,
        });
      } else {
        await sendGameChatMessageMutation({
          gameId: typedGameId,
          channel: chatChannel,
          text,
        });
      }
      setChatDraft("");
      setChatEditingMessageId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update chat message");
    }
  }, [
    chatChannel,
    chatDraft,
    chatEditingMessageId,
    editGameChatMessageMutation,
    sendGameChatMessageMutation,
    typedGameId,
  ]);

  const handleStartEditChatMessage = useCallback((message: ChatMessage) => {
    setChatEditingMessageId(message._id);
    setChatDraft(message.text);
  }, []);

  const handleCancelEditChatMessage = useCallback(() => {
    setChatEditingMessageId(null);
    setChatDraft("");
  }, []);

  const handleDeleteChatMessage = useCallback(
    async (messageId: string) => {
      if (!confirm("Delete this message?")) return;
      try {
        await deleteGameChatMessageMutation({
          messageId: messageId as Id<"gameChatMessages">,
        });
        if (chatEditingMessageId === messageId) {
          setChatEditingMessageId(null);
          setChatDraft("");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not delete message");
      }
    },
    [chatEditingMessageId, deleteGameChatMessageMutation],
  );

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

  const resolvePlayerColor = useCallback(
    (playerId: string, turnOrder: string[]) => getPlayerColor(playerId, playerMap, turnOrder),
    [playerMap],
  );

  useEffect(() => {
    if (!historyOpen) {
      setHistoryPlaying(false);
      return;
    }
    const maxIndex = Math.max(0, historyCount - 1);
    setHistoryFrameIndex((prev) => Math.min(prev, maxIndex));
  }, [historyCount, historyOpen]);

  useEffect(() => {
    if (!historyOpen || !historyPlaying) return;
    const maxIndex = historyCount - 1;
    if (maxIndex <= 0) return;
    const timer = setInterval(() => {
      setHistoryFrameIndex((prev) => {
        if (prev >= maxIndex) {
          setHistoryPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, HISTORY_PLAYBACK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [historyCount, historyOpen, historyPlaying, HISTORY_PLAYBACK_INTERVAL_MS]);

  useEffect(() => {
    if (!historyOpen) return;
    setSelectedFrom(null);
    setSelectedTo(null);
  }, [historyOpen]);

  useEffect(() => {
    if (chatChannel === "team" && !canUseTeamChat) {
      setChatChannel("global");
    }
  }, [canUseTeamChat, chatChannel]);

  useEffect(() => {
    if (!chatEditingMessageId) return;
    const messageStillExists = (chatMessages ?? []).some((message) => message._id === chatEditingMessageId);
    if (!messageStillExists) {
      setChatEditingMessageId(null);
      setChatDraft("");
    }
  }, [chatEditingMessageId, chatMessages]);

  const handleTogglePlayerHighlight = useCallback((playerId: string) => {
    setHighlightFilter((prev) => togglePlayerHighlight(prev, playerId));
  }, []);

  const handleToggleTeamHighlight = useCallback((teamId: string) => {
    setHighlightFilter((prev) => toggleTeamHighlight(prev, teamId));
  }, []);

  useEffect(() => {
    if (highlightFilter === "none") return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-map-canvas-zone='true']")) return;
      if (target.closest("[data-player-highlight-zone='true']")) return;
      setHighlightFilter("none");
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [highlightFilter]);

  useGameShortcuts({
    historyOpen,
    historyAtEnd,
    historyMaxIndex,
    isMyTurn,
    phase,
    reinforcementDraftCount: reinforcementDrafts.length,
    controlsDisabled,
    hasPendingOccupy: !!state?.pending,
    onToggleHistory: () => setHistoryOpen((prev) => !prev),
    onSetHistoryPlaying: setHistoryPlaying,
    onSetHistoryFrameIndex: setHistoryFrameIndex,
    onClearSelection: () => {
      setSelectedFrom(null);
      setSelectedTo(null);
    },
    onUndoPlacement: handleUndoPlacement,
    onConfirmPlacements: () => {
      void handleConfirmPlacements();
    },
    onEndAttackPhase: handleEndAttackPhase,
    onEndTurn: handleEndTurn,
  });

  const displayState = historyOpen ? (historyFrames[historyFrameIndex]?.state ?? state) : state;
  const highlightedTerritoryIds = useMemo(
    () => (displayState ? resolveHighlightedTerritoryIds(displayState, highlightFilter) : new Set<string>()),
    [displayState, highlightFilter],
  );
  const playerStats = useMemo(() => (displayState ? buildPlayerPanelStats(displayState) : []), [displayState]);

  if (!typedGameId) {
    return <div className="page-shell flex items-center justify-center">Invalid game URL</div>;
  }

  if (sessionPending) {
    return <div className="page-shell flex items-center justify-center">Loading game...</div>;
  }

  if (!session) {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
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

  const resolvedDisplayState = displayState ?? state;
  const displayPhase = resolvedDisplayState.turn.phase;
  const phaseCopy = PHASE_COPY[displayPhase] ?? PHASE_COPY.GameOver;
  const showPhaseTitle = historyOpen || isMyTurn || !["Reinforcement", "Attack", "Fortify"].includes(displayPhase);
  const effectiveCards = (
    view?.effectiveRuleset as { cards?: { forcedTradeHandSize?: number; tradeSets?: TradeSetsConfig } } | null
  )?.cards;
  const forcedTradeHandSize = effectiveCards?.forcedTradeHandSize ?? defaultRuleset.cards.forcedTradeHandSize;
  const tradeSets = effectiveCards?.tradeSets ?? defaultRuleset.cards.tradeSets;
  const myCardCount = myHand?.length ?? 0;
  const mustTradeNow =
    !historyOpen &&
    isMyTurn &&
    phase === "Reinforcement" &&
    myCardCount >= forcedTradeHandSize;
  const autoTradeCardIds = findAutoTradeSet(myHand ?? [], tradeSets);
  const winnerId =
    resolvedDisplayState.turnOrder.find((playerId) => resolvedDisplayState.players[playerId]?.status === "alive") ??
    null;
  const playbackTerritories = historyOpen ? resolvedDisplayState.territories : displayedTerritories;
  const showActionEdges =
    !historyOpen && isMyTurn && !!selectedFrom && (phase === "Attack" || phase === "Fortify");

  return (
    <div className="page-shell soft-grid overflow-x-hidden">
      <div className="page-container max-w-none flex min-h-[calc(100vh-2rem)] flex-col gap-1">
        <div className="glass-panel flex min-h-12 items-center gap-2 overflow-x-auto px-2 py-1.5">
          {showPhaseTitle && (
            <span className="shrink-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {phaseCopy.title}
            </span>
          )}

          {!historyOpen && !isMyTurn && displayPhase !== "GameOver" && (
            <span className="shrink-0 text-sm text-muted-foreground">
              It's {getPlayerName(resolvedDisplayState.turn.currentPlayerId, playerMap)}'s turn
            </span>
          )}

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
              <span className="text-xs text-muted-foreground">{queuedReinforcementTotal}</span>
            </div>
          )}

          {displayPhase === "GameOver" && (
            <span className="shrink-0 rounded border bg-background/70 px-2 py-1 text-sm">
              {winnerId ? getPlayerName(winnerId, playerMap) : "Unknown"}
            </span>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
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
                <HistoryScrubber
                  min={0}
                  max={historyMaxIndex}
                  value={historyFrameIndex}
                  onChange={(value) => {
                    setHistoryFrameIndex(value);
                    setHistoryPlaying(false);
                  }}
                />
              </>
            )}
            {!historyOpen && isMyTurn && phase === "Reinforcement" && (
              <Button
                type="button"
                size="sm"
                title="Confirm placements (Cmd/Ctrl+Enter)"
                disabled={controlsDisabled || reinforcementDrafts.length === 0}
                onClick={() => void handleConfirmPlacements()}
              >
                Confirm
                <ShortcutHint shortcut="mod+enter" />
              </Button>
            )}
            {!historyOpen && isMyTurn && phase === "Attack" && !state.pending && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                title="End attack phase (Cmd/Ctrl+Enter)"
                disabled={controlsDisabled}
                onClick={handleEndAttackPhase}
              >
                End Attack
                <ShortcutHint shortcut="mod+enter" />
              </Button>
            )}
            {!historyOpen && isMyTurn && phase === "Fortify" && (
              <Button
                size="sm"
                variant="outline"
                title="End turn (Cmd/Ctrl+Enter)"
                disabled={controlsDisabled}
                onClick={handleEndTurn}
              >
                End Turn
                <ShortcutHint shortcut="mod+enter" />
              </Button>
            )}
            <TooltipProvider>
              {!isSpectator && !historyOpen && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon-sm" onClick={handleResign} aria-label="Resign game">
                      <Flag className="size-4" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Resign game</TooltipContent>
                </Tooltip>
              )}
              {!isSpectator && !historyOpen && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="xs" type="button" onClick={() => setCardsOpen(true)}>
                      Cards ({myCardCount})
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open cards</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={historyOpen ? "default" : "outline"}
                    size="icon-sm"
                    type="button"
                    aria-label="Toggle history"
                    onClick={() => {
                      setHistoryOpen((prev) => !prev);
                      setHistoryPlaying(false);
                    }}
                    disabled={historyCount === 0}
                  >
                    <History className="size-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle history (H)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1" data-map-canvas-zone="true">
          <MapCanvas
            map={graphMap}
            visual={mapVisual}
            imageUrl={mapImageUrl}
            territories={playbackTerritories}
            turnOrder={resolvedDisplayState.turnOrder}
            selectedFrom={selectedFrom}
            selectedTo={selectedTo}
            validFromIds={!historyOpen && isMyTurn ? validFromIds : new Set()}
            validToIds={!historyOpen && isMyTurn ? validToIds : new Set()}
            highlightedTerritoryIds={highlightedTerritoryIds}
            graphEdgeMode={showActionEdges ? "action" : "none"}
            interactive={!historyOpen && isMyTurn}
            troopDeltaDurationMs={TROOP_DELTA_DURATION_MS}
            onClickTerritory={handleTerritoryClick}
            onClearSelection={() => {
              setSelectedFrom(null);
              setSelectedTo(null);
            }}
            getPlayerColor={resolvePlayerColor}
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

          <GamePlayersCard
            playerStats={playerStats}
            displayState={resolvedDisplayState}
            playerMap={playerMap}
            teamModeEnabled={!!view.teamModeEnabled}
            teamNames={teamNames}
            activeHighlight={highlightFilter}
            onTogglePlayerHighlight={handleTogglePlayerHighlight}
            onToggleTeamHighlight={handleToggleTeamHighlight}
            getPlayerColor={resolvePlayerColor}
            getPlayerName={getPlayerName}
          />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              <GameEventsCard flattenedEvents={flattenedEvents} />
            </div>
            <div>
              <GameChatCard
                messages={chatMessages ?? []}
                activeChannel={chatChannel}
                teamGameEnabled={!!view.teamModeEnabled}
                teamAvailable={canUseTeamChat}
                activeTeamName={myTeamName}
                canSend={canSendChat}
                draftText={chatDraft}
                editingMessageId={chatEditingMessageId}
                onSetDraftText={setChatDraft}
                onSelectChannel={(nextChannel) => {
                  setChatChannel(nextChannel);
                  setChatEditingMessageId(null);
                  setChatDraft("");
                }}
                onStartEditMessage={handleStartEditChatMessage}
                onCancelEditMessage={handleCancelEditChatMessage}
                onDeleteMessage={(messageId) => {
                  void handleDeleteChatMessage(messageId);
                }}
                onSend={() => {
                  void handleSendChatMessage();
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {cardsOpen && myHand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/65 p-4 backdrop-blur-[1px]">
          <Card className="glass-panel w-full max-w-lg border border-border/70 py-0 shadow-xl">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-base font-semibold">Cards ({myCardCount})</p>
                  <p className="text-sm text-muted-foreground">Select 3 to trade.</p>
                  {mustTradeNow && (
                    <p className="text-xs uppercase tracking-wide text-destructive">
                      Trade required at {forcedTradeHandSize}+ cards
                    </p>
                  )}
                </div>
                <Button size="xs" variant="outline" type="button" onClick={() => setCardsOpen(false)}>
                  Close
                </Button>
              </div>

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

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="xs"
                  disabled={controlsDisabled || phase !== "Reinforcement" || selectedCardIds.size !== 3}
                  onClick={handleTrade}
                >
                  Trade 3
                </Button>
                {mustTradeNow && autoTradeCardIds && (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={controlsDisabled || submitting}
                    onClick={() => {
                      void submitAction({
                        type: "TradeCards",
                        cardIds: autoTradeCardIds as CardId[],
                      });
                    }}
                  >
                    Auto Trade
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
