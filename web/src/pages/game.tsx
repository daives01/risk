import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ChevronRight, History, Layers, Pause, Play, SkipBack, SkipForward, SlidersHorizontal } from "lucide-react";
import type { Id } from "@backend/_generated/dataModel";
import { defaultRuleset } from "risk-engine";
import type { Action, CardId, TerritoryId } from "risk-engine";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { findLastTurnEndForPlayer } from "@/lib/game/history-navigation";
import type { ChatMessage } from "@/lib/game/types";
import type { ChatChannel } from "@/lib/game/types";
import type { ReinforcementDraft } from "@/lib/game/types";
import { ROTATING_HINTS } from "@/lib/game/rotating-hints";
import { useGameActions } from "@/lib/game/use-game-actions";
import { useGameRuntimeQueries, useGameViewQueries } from "@/lib/game/use-game-queries";
import { useGameShortcuts } from "@/lib/game/use-game-shortcuts";
import { toast } from "sonner";

type TradeSetsConfig = {
  allowThreeOfAKind: boolean;
  allowOneOfEach: boolean;
  wildActsAsAny: boolean;
};

const HINT_ROTATION_MS = 18000;

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
  let bestSelection: string[] | null = null;
  let bestWildCount = Number.POSITIVE_INFINITY;
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        const selected = [hand[i]!, hand[j]!, hand[k]!];
        if (isValidTradeSet(selected.map((card) => card.kind), tradeSets)) {
          const wildCount = selected.filter((card) => card.kind === "W").length;
          if (wildCount < bestWildCount) {
            bestSelection = selected.map((card) => card.cardId);
            bestWildCount = wildCount;
          }
          if (bestWildCount === 0) {
            return bestSelection;
          }
        }
      }
    }
  }
  return bestSelection;
}

function formatTurnTimer(ms: number): string {
  const totalHours = Math.max(0, Math.round(ms / (60 * 60 * 1000)));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0 && hours > 0) return `${days}d ${hours}hr`;
  if (days > 0) return `${days}d`;
  return `${hours}hr`;
}

function territorySignature(territories: Record<string, { ownerId: string; armies: number }> | undefined) {
  if (!territories) return "none";
  let checksum = 0;
  let count = 0;
  for (const [territoryId, territory] of Object.entries(territories)) {
    count += 1;
    checksum = (checksum + territory.armies * 31) | 0;
    checksum = (checksum + (territory.ownerId.codePointAt(0) ?? 0)) | 0;
    checksum = (checksum + (territoryId.codePointAt(0) ?? 0)) | 0;
  }
  return `${count}:${checksum}`;
}

export default function GamePage() {
  const HISTORY_PLAYBACK_INTERVAL_MS = 840;
  const TROOP_DELTA_DURATION_MS = Math.round(HISTORY_PLAYBACK_INTERVAL_MS * 1.25);
  const MAP_MAX_HEIGHT = "min(88vh, calc(100vh - 7rem))";
  const { gameId } = useParams<{ gameId: string }>();
  const location = useLocation();
  const historyDebugEnabled = useMemo(() => {
    if (new URLSearchParams(location.search).get("historyDebug") === "1") return true;
    if (typeof window === "undefined") return false;
    return (window as { __RISK_HISTORY_DEBUG?: boolean }).__RISK_HISTORY_DEBUG === true;
  }, [location.search]);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const mapPanelRef = useRef<HTMLDivElement | null>(null);
  const [mapPanelHeight, setMapPanelHeight] = useState<number | null>(null);
  const [mapPanelWidth, setMapPanelWidth] = useState<number | null>(null);
  const [mapImageWidth, setMapImageWidth] = useState<number | null>(null);

  const typedGameId = gameId as Id<"games"> | undefined;
  const { playerView, publicView } = useGameViewQueries(session, typedGameId);
  const { view, myEnginePlayerId, myHand, playerMap, state } = adaptView(playerView, publicView);
  const [chatChannel, setChatChannel] = useState<ChatChannel>("global");
  const [chatDraft, setChatDraft] = useState("");
  const [chatEditingMessageId, setChatEditingMessageId] = useState<string | null>(null);
  const { mapDoc, historyTimeline, timelineActions, chatMessages } = useGameRuntimeQueries(
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [attackSubmitting, setAttackSubmitting] = useState(false);
  const [recentAttackEdgeIds, setRecentAttackEdgeIds] = useState<Set<string> | null>(null);
  const recentAttackEventRef = useRef<string | null>(null);
  const recentAttackTimeoutRef = useRef<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPlaying, setHistoryPlaying] = useState(false);
  const [historyFrameIndex, setHistoryFrameIndex] = useState(0);
  const [suppressTroopDeltas, setSuppressTroopDeltas] = useState(false);
  const [highlightFilter, setHighlightFilter] = useState<HighlightFilter>("none");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [autoAttacking, setAutoAttacking] = useState(false);
  const autoAttackSubmittedVersionRef = useRef<number | null>(null);
  const autoEndFortifyVersionRef = useRef<number | null>(null);
  const optionalTradeAutoOpenRef = useRef<number | null>(null);
  const actionInFlightRef = useRef(false);
  const [endgameModal, setEndgameModal] = useState<"won" | "lost" | null>(null);
  const dismissedEndgameRef = useRef(false);
  const troopDeltaResumeTimeoutRef = useRef<number | null>(null);
  const [hintIndex, setHintIndex] = useState(() => Math.floor(Math.random() * ROTATING_HINTS.length));
  const hintIntervalRef = useRef<number | null>(null);
  const historyDebugRef = useRef<{ framePos: number; signature: string; staleRun: number } | null>(null);

  const phase = state?.turn.phase ?? "GameOver";
  const isSpectator = !myEnginePlayerId;
  const isMyTurn = !!myEnginePlayerId && !!state && state.turn.currentPlayerId === myEnginePlayerId;
  const controlsDisabled = !isMyTurn || isSpectator || submitting || historyOpen;
  const canSetOccupyShortcut =
    !!state?.pending &&
    (phase === "Occupy" || (phase === "Attack" && !!state?.pending)) &&
    isMyTurn &&
    !historyOpen;
  const historyFrames = useMemo(() => historyTimeline ?? [], [historyTimeline]);
  const historyCount = historyFrames.length;
  const historyMaxIndex = Math.max(0, historyCount - 1);
  const historyAtEnd = historyFrameIndex >= historyMaxIndex;
  const lastTurnEndIndex = useMemo(
    () => findLastTurnEndForPlayer(historyFrames, myEnginePlayerId),
    [historyFrames, myEnginePlayerId],
  );

  const queuedReinforcementTotal = useMemo(
    () => reinforcementDrafts.reduce((sum, draft) => sum + draft.count, 0),
    [reinforcementDrafts],
  );
  const remainingReinforcements = state?.reinforcements?.remaining ?? 0;
  const uncommittedReinforcements = Math.max(0, remainingReinforcements - queuedReinforcementTotal);
  const isPlacementPhase = state?.turn.phase === "Reinforcement";
  const effectiveTeams = (view?.effectiveRuleset as {
    teams?: {
      teamsEnabled?: boolean;
      allowPlaceOnTeammate?: boolean;
      allowFortifyWithTeammate?: boolean;
      allowFortifyThroughTeammates?: boolean;
      preventAttackingTeammates?: boolean;
    };
  } | null)?.teams;
  const effectiveRuleset = view?.effectiveRuleset as {
    cards?: { forcedTradeHandSize?: number; tradeSets?: TradeSetsConfig };
    fortify?: { maxFortifiesPerTurn?: number; fortifyMode?: "adjacent" | "connected" };
  } | null;
  const effectiveCards = effectiveRuleset?.cards;
  const effectiveFortify = effectiveRuleset?.fortify;
  const forcedTradeHandSize = effectiveCards?.forcedTradeHandSize ?? defaultRuleset.cards.forcedTradeHandSize;
  const tradeSets = effectiveCards?.tradeSets ?? defaultRuleset.cards.tradeSets;
  const maxFortifiesPerTurn = effectiveFortify?.maxFortifiesPerTurn ?? defaultRuleset.fortify.maxFortifiesPerTurn;
  const fortifyMode = effectiveFortify?.fortifyMode ?? defaultRuleset.fortify.fortifyMode;
  const fortifiesUsedThisTurn = state?.fortifiesUsedThisTurn ?? 0;
  const fortifiesRemaining = Math.max(0, maxFortifiesPerTurn - fortifiesUsedThisTurn);
  const maxFortifyMove = Math.max(1, (state?.territories[selectedFrom ?? ""]?.armies ?? 2) - 1);
  const canSetFortifyShortcut =
    phase === "Fortify" &&
    isMyTurn &&
    !historyOpen &&
    !controlsDisabled &&
    !!selectedFrom &&
    !!selectedTo &&
    maxFortifyMove > 0;
  const allowPlaceOnTeammate = effectiveTeams?.allowPlaceOnTeammate ?? true;
  const allowFortifyWithTeammate = effectiveTeams?.allowFortifyWithTeammate ?? true;
  const allowFortifyThroughTeammates = effectiveTeams?.allowFortifyThroughTeammates ?? true;
  const teamsEnabled = effectiveTeams?.teamsEnabled ?? false;
  const preventAttackingTeammates = effectiveTeams?.preventAttackingTeammates ?? false;
  const teamNames = (view?.teamNames as Record<string, string> | null) ?? {};
  const myTeamId = myEnginePlayerId && state ? state.players[myEnginePlayerId]?.teamId : undefined;
  const myTeamName = myTeamId ? teamNames[myTeamId] ?? myTeamId : null;
  const canUseTeamChat = !!view?.teamModeEnabled && !!myTeamId;
  const canSendChat = !isSpectator && !historyOpen && view?.status === "active";
  const myCardCount = myHand?.length ?? 0;
  const mustTradeNow =
    !historyOpen &&
    isMyTurn &&
    phase === "Reinforcement" &&
    myCardCount >= forcedTradeHandSize;
  const autoTradeCardIds = findAutoTradeSet(myHand ?? [], tradeSets);
  const timingMode = (view as { timingMode?: "realtime" | "async_1d" | "async_3d" } | null)?.timingMode ?? "realtime";
  const turnDeadlineAt = (view as { turnDeadlineAt?: number | null } | null)?.turnDeadlineAt ?? null;
  const remainingTurnMs = turnDeadlineAt ? Math.max(0, turnDeadlineAt - nowMs) : null;
  const winningPlayerId = (view as { winningPlayerId?: string | null } | null)?.winningPlayerId ?? null;
  const winningTeamId = (view as { winningTeamId?: string | null } | null)?.winningTeamId ?? null;
  const isWinner = useMemo(() => {
    if (!myEnginePlayerId) return false;
    if (winningPlayerId) return myEnginePlayerId === winningPlayerId;
    if (winningTeamId && myTeamId) return winningTeamId === myTeamId;
    return false;
  }, [myEnginePlayerId, myTeamId, winningPlayerId, winningTeamId]);
  const isEliminated = !!myEnginePlayerId && state?.players[myEnginePlayerId]?.status === "defeated";
  const showTurnTimer = timingMode !== "realtime" && !!turnDeadlineAt;
  const turnTimerLabel = showTurnTimer
    ? remainingTurnMs === 0
      ? "0hr"
      : formatTurnTimer(remainingTurnMs ?? 0)
    : null;
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
      const canFortifyTo = (ownerId: string) => {
        if (ownerId === myEnginePlayerId) return true;
        if (!teamsEnabled) return false;
        if (!allowFortifyWithTeammate) return false;
        return isTeammateOwner(ownerId);
      };

      if (fortifyMode === "adjacent") {
        const neighbors = graphMap.adjacency[selectedFrom] ?? [];
        for (const neighborId of neighbors) {
          if (neighborId === selectedFrom) continue;
          const territory = state.territories[neighborId];
          if (!territory) continue;
          if (!canFortifyTo(territory.ownerId)) continue;
          ids.add(neighborId);
        }
      } else {
        const canTraverse = (ownerId: string) => {
          if (ownerId === myEnginePlayerId) return true;
          if (!teamsEnabled) return false;
          if (!allowFortifyThroughTeammates) return false;
          return isTeammateOwner(ownerId);
        };

        const visited = new Set<string>();
        const queue: string[] = [selectedFrom];
        visited.add(selectedFrom);

        while (queue.length > 0) {
          const current = queue.shift();
          if (!current) continue;
          const neighbors = graphMap.adjacency[current] ?? [];
          for (const neighbor of neighbors) {
            if (visited.has(neighbor)) continue;
            const territory = state.territories[neighbor];
            if (!territory) continue;
            if (!canTraverse(territory.ownerId)) continue;
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }

        for (const territoryId of visited) {
          if (territoryId === selectedFrom) continue;
          const territory = state.territories[territoryId];
          if (!territory) continue;
          if (!canFortifyTo(territory.ownerId)) continue;
          ids.add(territoryId);
        }
      }
    }

    return ids;
  }, [
    allowFortifyThroughTeammates,
    allowFortifyWithTeammate,
    fortifyMode,
    graphMap,
    isTeammateOwner,
    myEnginePlayerId,
    preventAttackingTeammates,
    selectedFrom,
    state,
    teamsEnabled,
  ]);

  const fortifyConnectedEdgeIds = useMemo(() => {
    if (!state || !graphMap || !selectedFrom) return undefined;
    if (historyOpen || !isMyTurn) return undefined;
    if (phase !== "Fortify") return undefined;
    if (fortifyMode !== "connected") return undefined;
    if (!validFromIds.has(selectedFrom)) return undefined;

    const canTraverse = (ownerId: string) => {
      if (ownerId === myEnginePlayerId) return true;
      if (!teamsEnabled) return false;
      if (!allowFortifyThroughTeammates) return false;
      return isTeammateOwner(ownerId);
    };

    const visited = new Set<string>();
    const queue: string[] = [selectedFrom];
    visited.add(selectedFrom);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const neighbors = graphMap.adjacency[current] ?? [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        const territory = state.territories[neighbor];
        if (!territory) continue;
        if (!canTraverse(territory.ownerId)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    const edgeIds = new Set<string>();
    for (const fromId of visited) {
      const neighbors = graphMap.adjacency[fromId] ?? [];
      for (const toId of neighbors) {
        if (!visited.has(toId)) continue;
        const edgeKey = fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`;
        edgeIds.add(edgeKey);
      }
    }

    return edgeIds.size > 0 ? edgeIds : undefined;
  }, [
    allowFortifyThroughTeammates,
    fortifyMode,
    graphMap,
    historyOpen,
    isMyTurn,
    isTeammateOwner,
    myEnginePlayerId,
    phase,
    selectedFrom,
    state,
    teamsEnabled,
    validFromIds,
  ]);

  const submitAction = useCallback(
    async (
      action: Action,
      options?: {
        preserveSelection?: boolean;
        preserveAttackDice?: boolean;
      },
    ) => {
      if (!typedGameId || !state) return;
      if (actionInFlightRef.current) return;
      actionInFlightRef.current = true;
      const isOptimisticAction =
        action.type === "PlaceReinforcements" ||
        action.type === "Occupy" ||
        action.type === "Fortify" ||
        action.type === "EndAttackPhase";
      const isAttackAction = action.type === "Attack";
      setSubmitting(true);
      if (isAttackAction) {
        setAttackSubmitting(true);
      }
      const resetAfterAction = () => {
        if (!options?.preserveSelection) {
          setSelectedFrom(null);
          setSelectedTo(null);
        }
        setPlaceCount(1);
        setReinforcementDrafts([]);
        if (!options?.preserveAttackDice) {
          setAttackDice(3);
        }
        setOccupyMove(1);
        setFortifyCount(1);
        setSelectedCardIds(new Set());
      };
      if (isOptimisticAction) {
        resetAfterAction();
      }
      try {
        const mutationAction =
          action.type === "TradeCards"
            ? { ...action, cardIds: [...action.cardIds] }
            : action;
        await submitActionMutation({
          gameId: typedGameId,
          expectedVersion: state.stateVersion,
          action: mutationAction,
        });
        if (!isOptimisticAction) {
          resetAfterAction();
        }
      } catch (error) {
        autoAttackSubmittedVersionRef.current = null;
        setAutoAttacking(false);
        toast.error(error instanceof Error ? error.message : "Action failed");
      } finally {
        actionInFlightRef.current = false;
        setSubmitting(false);
        if (isAttackAction) {
          setAttackSubmitting(false);
        }
      }
    },
    [state, submitActionMutation, typedGameId],
  );

  const stopAutoAttack = useCallback(() => {
    autoAttackSubmittedVersionRef.current = null;
    setAutoAttacking(false);
  }, []);

  const handleTerritoryClick = useCallback(
    (territoryId: string) => {
      if (!state || controlsDisabled) return;

      if (state.turn.phase === "Reinforcement") {
        if (mustTradeNow) return;
        if (validFromIds.has(territoryId) && uncommittedReinforcements > 0) {
          const queuedCount = Math.min(placeCount, uncommittedReinforcements);
          setReinforcementDrafts((prev) => [...prev, { territoryId, count: queuedCount }]);
        }
        return;
      }

      if (state.turn.phase === "Attack") {
        if (!selectedFrom && validFromIds.has(territoryId)) {
          stopAutoAttack();
          setSelectedFrom(territoryId);
          setSelectedTo(null);
          return;
        }

        if (territoryId === selectedFrom) {
          stopAutoAttack();
          setSelectedFrom(null);
          setSelectedTo(null);
          return;
        }

        if (selectedFrom && validToIds.has(territoryId)) {
          stopAutoAttack();
          setSelectedTo(territoryId);
          const armies = state.territories[selectedFrom]?.armies ?? 2;
          setAttackDice(Math.min(3, armies - 1));
          return;
        }

        if (validFromIds.has(territoryId)) {
          stopAutoAttack();
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
    [
      controlsDisabled,
      mustTradeNow,
      placeCount,
      selectedFrom,
      state,
      stopAutoAttack,
      uncommittedReinforcements,
      validFromIds,
      validToIds,
    ],
  );

  const handleUndoPlacement = useCallback(() => {
    setReinforcementDrafts((prev) => prev.slice(0, -1));
  }, []);

  const handleConfirmPlacements = useCallback(async () => {
    if (!typedGameId || !state || reinforcementDrafts.length === 0 || mustTradeNow) return;
    const previousDrafts = reinforcementDrafts;
    setReinforcementDrafts([]);
    setPlaceCount(1);
    setSelectedFrom(null);
    setSelectedTo(null);
    try {
      await submitReinforcementPlacementsMutation({
        gameId: typedGameId,
        expectedVersion: state.stateVersion,
        placements: previousDrafts,
      });
    } catch (error) {
      setReinforcementDrafts(previousDrafts);
      toast.error(error instanceof Error ? error.message : "Could not confirm placements");
    }
  }, [mustTradeNow, reinforcementDrafts, state, submitReinforcementPlacementsMutation, typedGameId]);

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

  useEffect(() => {
    const pending = state?.pending;
    if (
      !pending ||
      !isMyTurn ||
      historyOpen ||
      controlsDisabled ||
      phase === "GameOver" ||
      pending.minMove !== pending.maxMove
    ) {
      return;
    }
    void submitAction({ type: "Occupy", moveArmies: pending.minMove });
  }, [controlsDisabled, historyOpen, isMyTurn, phase, state?.pending, submitAction]);

  useEffect(() => {
    if (!state || phase !== "Attack") {
      stopAutoAttack();
      return;
    }
    if (selectedFrom && !validFromIds.has(selectedFrom)) {
      stopAutoAttack();
      setSelectedFrom(null);
      setSelectedTo(null);
      return;
    }
    if (selectedTo && !validToIds.has(selectedTo)) {
      stopAutoAttack();
      setSelectedTo(null);
    }
  }, [phase, selectedFrom, selectedTo, state, stopAutoAttack, validFromIds, validToIds]);

  useEffect(() => {
    if (!selectedFrom || phase !== "Attack" || !state) return;
    const maxDice = Math.max(1, Math.min(3, (state.territories[selectedFrom]?.armies ?? 2) - 1));
    setAttackDice((prev) => Math.max(1, Math.min(prev, maxDice)));
  }, [phase, selectedFrom, state]);

  useEffect(() => {
    if (!autoAttacking) return;
    if (!state || !isMyTurn || historyOpen || phase !== "Attack" || state.pending) {
      stopAutoAttack();
      return;
    }
    if (!selectedFrom || !selectedTo || submitting) return;
    const fromArmies = state.territories[selectedFrom]?.armies ?? 0;
    if (fromArmies < 4) {
      stopAutoAttack();
      return;
    }
    if (!validToIds.has(selectedTo)) {
      stopAutoAttack();
      return;
    }
    if (autoAttackSubmittedVersionRef.current === state.stateVersion) return;
    autoAttackSubmittedVersionRef.current = state.stateVersion;
    void submitAction(
      {
        type: "Attack",
        from: selectedFrom as TerritoryId,
        to: selectedTo as TerritoryId,
        attackerDice: 3,
      },
      { preserveSelection: true, preserveAttackDice: true },
    );
  }, [
    autoAttacking,
    historyOpen,
    isMyTurn,
    phase,
    selectedFrom,
    selectedTo,
    state,
    stopAutoAttack,
    submitAction,
    submitting,
    validToIds,
  ]);

  useEffect(() => {
    if (!state || !isMyTurn || historyOpen) return;
    if (phase !== "Fortify") {
      autoEndFortifyVersionRef.current = null;
      return;
    }
    if (submitting) return;
    if (maxFortifiesPerTurn >= Number.MAX_SAFE_INTEGER) return;
    if (fortifiesRemaining > 0) {
      autoEndFortifyVersionRef.current = null;
      return;
    }
    if (autoEndFortifyVersionRef.current === state.stateVersion) return;
    autoEndFortifyVersionRef.current = state.stateVersion;
    void submitAction({ type: "EndTurn" });
  }, [
    fortifiesRemaining,
    historyOpen,
    isMyTurn,
    maxFortifiesPerTurn,
    phase,
    state,
    submitAction,
    submitting,
  ]);

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
    void submitAction(
      {
        type: "Attack",
        from: selectedFrom as TerritoryId,
        to: selectedTo as TerritoryId,
        attackerDice: attackDice,
      },
      { preserveSelection: true, preserveAttackDice: true },
    );
  }, [attackDice, selectedFrom, selectedTo, submitAction]);

  const handleAutoAttackToggle = useCallback(() => {
    if (autoAttacking) {
      stopAutoAttack();
      return;
    }
    autoAttackSubmittedVersionRef.current = null;
    setAutoAttacking(true);
  }, [autoAttacking, stopAutoAttack]);

  const handleEndAttackPhase = useCallback(() => {
    stopAutoAttack();
    void submitAction({ type: "EndAttackPhase" });
  }, [stopAutoAttack, submitAction]);

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

  const historyEvents = useMemo(() => {
    if (!timelineActions?.length) return [];
    const events: Array<{ key: string; text: string; index: number }> = [];
    let attackStreak: {
      key: string;
      fromId: string;
      toId: string;
      fromLabel: string;
      toLabel: string;
      count: number;
      attackerLosses: number;
      defenderLosses: number;
      index: number;
    } | null = null;
    const flushAttackStreak = () => {
      if (!attackStreak) return;
      const lossLabel = `attacker -${attackStreak.attackerLosses}, defender -${attackStreak.defenderLosses}`;
      const attackLabel = attackStreak.count > 1
        ? `${attackStreak.fromLabel} attacked ${attackStreak.toLabel} x${attackStreak.count} (${lossLabel})`
        : `${attackStreak.fromLabel} attacked ${attackStreak.toLabel} (${lossLabel})`;
      events.push({ key: attackStreak.key, text: attackLabel, index: attackStreak.index });
      attackStreak = null;
    };

    for (const action of timelineActions) {
      for (const [eventIndex, event] of action.events.entries()) {
        if (event.type === "AttackResolved") {
          const from = String(event.from ?? "");
          const to = String(event.to ?? "");
          const fromLabel = graphMap?.territories[from]?.name ?? from;
          const toLabel = graphMap?.territories[to]?.name ?? to;
          const nextKey = `${action._id}-${eventIndex}`;
          const attackerLosses = Number(event.attackerLosses ?? 0);
          const defenderLosses = Number(event.defenderLosses ?? 0);
          if (!attackStreak) {
            attackStreak = {
              key: nextKey,
              fromId: from,
              toId: to,
              fromLabel,
              toLabel,
              count: 1,
              attackerLosses,
              defenderLosses,
              index: action.index,
            };
          } else if (attackStreak.fromId === from && attackStreak.toId === to) {
            attackStreak.count += 1;
            attackStreak.attackerLosses += attackerLosses;
            attackStreak.defenderLosses += defenderLosses;
          } else {
            flushAttackStreak();
            attackStreak = {
              key: nextKey,
              fromId: from,
              toId: to,
              fromLabel,
              toLabel,
              count: 1,
              attackerLosses,
              defenderLosses,
              index: action.index,
            };
          }
          continue;
        }
        flushAttackStreak();
        events.push({
          key: `${action._id}-${eventIndex}`,
          text: formatEvent(event, playerMap, graphMap),
          index: action.index,
        });
      }
    }
    flushAttackStreak();
    return events.slice(-80).reverse();
  }, [graphMap, playerMap, timelineActions]);

  const activeHistoryEventIndex = useMemo(() => {
    if (!historyOpen) return null;
    return historyFrames[historyFrameIndex]?.index ?? null;
  }, [historyFrameIndex, historyFrames, historyOpen]);

  const historyAttackEdgeIds = useMemo(() => {
    if (!timelineActions?.length) return null;
    const frame = historyFrames[historyFrameIndex];
    if (!frame) return null;
    const action = timelineActions.find((entry) => entry.index === frame.index);
    if (!action) return null;

    for (let i = action.events.length - 1; i >= 0; i -= 1) {
      const event = action.events[i];
      if (event?.type !== "AttackResolved") continue;
      const from = typeof event.from === "string" ? event.from : null;
      const to = typeof event.to === "string" ? event.to : null;
      if (!from || !to) continue;
      const edgeKey = from < to ? `${from}|${to}` : `${to}|${from}`;
      return new Set([edgeKey]);
    }

    return null;
  }, [historyFrameIndex, historyFrames, timelineActions]);

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
    if (!historyOpen) return;
    setHistoryFrameIndex((prev) => {
      if (prev !== 0) return prev;
      return Math.min(lastTurnEndIndex, historyMaxIndex);
    });
  }, [historyMaxIndex, historyOpen, lastTurnEndIndex]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!ROTATING_HINTS.length) return undefined;
    if (hintIntervalRef.current) {
      window.clearInterval(hintIntervalRef.current);
    }
    hintIntervalRef.current = window.setInterval(() => {
      setHintIndex((prev) => {
        if (ROTATING_HINTS.length === 1) return prev;
        let next = Math.floor(Math.random() * ROTATING_HINTS.length);
        if (next === prev) {
          next = (next + 1) % ROTATING_HINTS.length;
        }
        return next;
      });
    }, HINT_ROTATION_MS);
    return () => {
      if (hintIntervalRef.current) {
        window.clearInterval(hintIntervalRef.current);
      }
    };
  }, []);

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
    stopAutoAttack();
    setSelectedFrom(null);
    setSelectedTo(null);
  }, [historyOpen, stopAutoAttack]);

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

  useEffect(() => {
    if (historyOpen || isSpectator || !isMyTurn) return;
    if (phase !== "Reinforcement") return;
    if (!myHand || myHand.length === 0) return;
    if (!autoTradeCardIds) return;
    if (cardsOpen) return;
    const stateVersion = state?.stateVersion ?? 0;
    if (mustTradeNow) {
      setCardsOpen(true);
      return;
    }
    if (optionalTradeAutoOpenRef.current === stateVersion) return;
    optionalTradeAutoOpenRef.current = stateVersion;
    setCardsOpen(true);
  }, [
    autoTradeCardIds,
    cardsOpen,
    historyOpen,
    isMyTurn,
    isSpectator,
    mustTradeNow,
    myHand,
    phase,
    state?.stateVersion,
  ]);

  useEffect(() => {
    if (historyOpen || isSpectator || !state) return;
    if (state.turn.phase !== "GameOver") return;
    if (endgameModal || dismissedEndgameRef.current) return;
    if (isWinner) {
      setEndgameModal("won");
      return;
    }
    if (isEliminated) {
      setEndgameModal("lost");
    }
  }, [endgameModal, historyOpen, isEliminated, isSpectator, isWinner, state]);

  useGameShortcuts({
    historyOpen,
    historyAtEnd,
    historyMaxIndex,
    isMyTurn,
    phase,
    cardsOpen,
    placeCount,
    attackDice,
    occupyMove,
    fortifyCount,
    maxPlaceCount: uncommittedReinforcements,
    maxAttackDice: selectedFrom ? Math.max(0, Math.min(3, (state?.territories[selectedFrom]?.armies ?? 2) - 1)) : 0,
    reinforcementDraftCount: reinforcementDrafts.length,
    controlsDisabled,
    hasPendingOccupy: !!state?.pending,
    canSetOccupy: canSetOccupyShortcut,
    occupyMinMove: state?.pending?.minMove ?? 1,
    occupyMaxMove: state?.pending?.maxMove ?? 1,
    canSetFortify: canSetFortifyShortcut,
    maxFortifyCount: maxFortifyMove,
    onToggleHistory: () => setHistoryOpen((prev) => !prev),
    onToggleShortcutCheatSheet: () => setShortcutsOpen((prev) => !prev),
    onSetHistoryPlaying: setHistoryPlaying,
    onSetHistoryFrameIndex: setHistoryFrameIndex,
    onSetPlaceCount: setPlaceCount,
    onSetAttackDice: setAttackDice,
    onSetOccupyMove: setOccupyMove,
    onSetFortifyCount: setFortifyCount,
    onToggleCards: () => {
      if (!isSpectator && !historyOpen) {
        setCardsOpen((prev) => !prev);
      }
    },
    onCloseCards: () => {
      setCardsOpen(false);
    },
    onClearSelection: () => {
      stopAutoAttack();
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

  useLayoutEffect(() => {
    const node = mapPanelRef.current;
    if (!node) return;
    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      const widthFallback = rect.width > 0 ? (rect.width * 3) / 4 : 0;
      const nextHeight = rect.height > 0 ? rect.height : widthFallback;
      setMapPanelHeight(nextHeight > 0 ? nextHeight : null);
      setMapPanelWidth(rect.width > 0 ? rect.width : null);
    };
    updateSize();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextHeight = entry.contentRect.height;
      setMapPanelHeight(nextHeight > 0 ? nextHeight : null);
      setMapPanelWidth(entry.contentRect.width > 0 ? entry.contentRect.width : null);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSuppressTroopDeltas(true);
    if (troopDeltaResumeTimeoutRef.current !== null) {
      window.clearTimeout(troopDeltaResumeTimeoutRef.current);
    }
    troopDeltaResumeTimeoutRef.current = window.setTimeout(() => {
      setSuppressTroopDeltas(false);
      troopDeltaResumeTimeoutRef.current = null;
    }, 320);
  }, [historyOpen]);

  useEffect(() => {
    return () => {
      if (troopDeltaResumeTimeoutRef.current !== null) {
        window.clearTimeout(troopDeltaResumeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (recentAttackTimeoutRef.current !== null) {
      window.clearTimeout(recentAttackTimeoutRef.current);
      recentAttackTimeoutRef.current = null;
    }
    if (historyOpen) {
      setRecentAttackEdgeIds(null);
      return;
    }
    if (!timelineActions?.length) return;
    const latestAction = timelineActions[timelineActions.length - 1];
    if (!latestAction) return;

    for (let i = latestAction.events.length - 1; i >= 0; i -= 1) {
      const event = latestAction.events[i];
      if (event?.type !== "AttackResolved") continue;
      const from = typeof event.from === "string" ? event.from : null;
      const to = typeof event.to === "string" ? event.to : null;
      if (!from || !to) return;
      const eventKey = `${latestAction._id}-${i}`;
      if (recentAttackEventRef.current === eventKey) return;
      recentAttackEventRef.current = eventKey;
      const edgeKey = from < to ? `${from}|${to}` : `${to}|${from}`;
      setRecentAttackEdgeIds(new Set([edgeKey]));
      recentAttackTimeoutRef.current = window.setTimeout(() => {
        setRecentAttackEdgeIds(null);
        recentAttackTimeoutRef.current = null;
      }, TROOP_DELTA_DURATION_MS);
      return;
    }
  }, [historyOpen, timelineActions, TROOP_DELTA_DURATION_MS]);

  useEffect(() => {
    return () => {
      if (recentAttackTimeoutRef.current !== null) {
        window.clearTimeout(recentAttackTimeoutRef.current);
      }
    };
  }, []);

  const debugTerritories = historyOpen ? historyFrames[historyFrameIndex]?.state?.territories : displayedTerritories;

  useEffect(() => {
    if (!historyDebugEnabled || !historyFrames.length) return;
    const replayErrors = historyFrames
      .filter((frame) => !!frame.replayError)
      .map((frame) => ({ index: frame.index, actionType: frame.actionType, replayError: frame.replayError }));
    if (replayErrors.length > 0) {
      console.warn("[HistoryDebug] Replay errors found in history timeline", replayErrors);
    }
  }, [historyDebugEnabled, historyFrames]);

  useEffect(() => {
    if (!historyDebugEnabled || !historyOpen) return;
    const frame = historyFrames[historyFrameIndex];
    const signature = territorySignature(debugTerritories);
    const prev = historyDebugRef.current;
    const staleRun = prev && prev.signature === signature && prev.framePos !== historyFrameIndex
      ? prev.staleRun + 1
      : 0;
    historyDebugRef.current = { framePos: historyFrameIndex, signature, staleRun };

    console.debug("[HistoryDebug] Frame update", {
      framePos: historyFrameIndex,
      frameIndex: frame?.index ?? null,
      actionType: frame?.actionType ?? null,
      turnRound: frame?.turnRound ?? null,
      turnPhase: frame?.turnPhase ?? null,
      stateVersion: frame?.state?.stateVersion ?? null,
      territorySig: signature,
      replayError: frame?.replayError ?? null,
      staleRun,
    });

    if (staleRun >= 3) {
      console.warn("[HistoryDebug] Territory signature unchanged across multiple frame advances", {
        framePos: historyFrameIndex,
        frameIndex: frame?.index ?? null,
        staleRun,
      });
    }
  }, [debugTerritories, historyDebugEnabled, historyFrameIndex, historyFrames, historyOpen]);

  if (!typedGameId) {
    return <div className="page-shell flex items-center justify-center">Invalid game URL</div>;
  }

  if (sessionPending) {
    return <div className="page-shell flex items-center justify-center">Loading game...</div>;
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
  const showPhaseTitle = historyOpen || !["Reinforcement", "Attack", "Fortify"].includes(displayPhase);
  const fortifiesUsedForDisplay = resolvedDisplayState.fortifiesUsedThisTurn ?? 0;
  const fortifiesRemainingForDisplay = Math.max(0, maxFortifiesPerTurn - fortifiesUsedForDisplay);
  const fortifyRemainingLabel =
    maxFortifiesPerTurn >= Number.MAX_SAFE_INTEGER
      ? "Unlimited fortifies"
      : `${fortifiesRemainingForDisplay} ${fortifiesRemainingForDisplay === 1 ? "fortify" : "fortifies"} left`;
  const actionHint = !historyOpen && isMyTurn
    ? (() => {
      if (phase === "Reinforcement") {
        return "Click territory to place";
      }
      if (phase === "Attack") {
        if (state.pending) return "Select troop count to move";
        if (!selectedFrom) return "Select troops for attack";
        if (!selectedTo) return "Select territory to attack";
        return "Choose dice and attack";
      }
      if (phase === "Occupy") {
        return "Select troop count to move";
      }
      if (phase === "Fortify") {
        if (!selectedFrom) return "Select territory to move from";
        if (!selectedTo) return "Select territory to move to";
        return "Select troop count to move";
      }
      return null;
    })()
    : null;
  const currentHint = ROTATING_HINTS[hintIndex] ?? null;
  const winnerId =
    resolvedDisplayState.turnOrder.find((playerId) => resolvedDisplayState.players[playerId]?.status === "alive") ??
    null;
  const playbackTerritories = historyOpen ? resolvedDisplayState.territories : displayedTerritories;
  const pendingOccupy = state.pending?.type === "Occupy" ? state.pending : null;
  const mapSelectedFrom = pendingOccupy?.from ?? selectedFrom;
  const mapSelectedTo = pendingOccupy?.to ?? selectedTo;
  const showActionEdges =
    !historyOpen &&
    isMyTurn &&
    !!mapSelectedFrom &&
    (phase === "Attack" || phase === "Fortify" || (phase === "Occupy" && !!state.pending));
  const showSignInCta = !sessionPending && !session;
  const loginHref = `/login?redirect=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
  const renderHistoryControls = () => (
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
  );
  const renderHistoryScrubber = () => (
    <HistoryScrubber
      min={0}
      max={historyMaxIndex}
      value={historyFrameIndex}
      onChange={(value) => {
        setHistoryFrameIndex(value);
        setHistoryPlaying(false);
      }}
    />
  );

  return (
    <div className="page-shell soft-grid game-shell overflow-x-hidden">
      <div className="game-header glass-panel relative flex min-h-12 flex-wrap items-center gap-2 px-2 py-1.5">
        <div className="flex min-w-0 flex-col">
          {showPhaseTitle && (
            <span className="shrink-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {phaseCopy.title}
            </span>
          )}
          {actionHint && (
            <span className="turn-hint max-w-[min(52vw,260px)] truncate text-xs font-semibold uppercase tracking-wide">
              {actionHint}
            </span>
          )}
          {!historyOpen && isMyTurn && phase === "Reinforcement" && (
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {uncommittedReinforcements} left
            </span>
          )}
          {!historyOpen && isMyTurn && phase === "Fortify" && (
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{fortifyRemainingLabel}</span>
          )}
        </div>

        {!historyOpen && !isMyTurn && displayPhase !== "GameOver" && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm text-muted-foreground">
              It's {getPlayerName(resolvedDisplayState.turn.currentPlayerId, playerMap)}'s turn
            </span>
            {showSignInCta && (
              <Button asChild size="xs" variant="outline">
                <Link to={loginHref}>Sign in</Link>
              </Button>
            )}
          </div>
        )}

        {!historyOpen && !isMyTurn && currentHint && (
          <div className="absolute left-1/2 hidden w-[min(60vw,640px)] -translate-x-1/2 items-center justify-center gap-2 text-xs text-muted-foreground md:flex">
            <span className="hint-text truncate text-center">{currentHint}</span>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Show another hint"
              className="hint-next"
              onClick={() => {
                setHintIndex((prev) => {
                  if (ROTATING_HINTS.length <= 1) return prev;
                  let next = Math.floor(Math.random() * ROTATING_HINTS.length);
                  if (next === prev) {
                    next = (next + 1) % ROTATING_HINTS.length;
                  }
                  return next;
                });
              }}
            >
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
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
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={controlsDisabled || reinforcementDrafts.length === 0}
              onClick={handleUndoPlacement}
            >
              Undo
            </Button>
          </div>
        )}

        {displayPhase === "GameOver" && (
          <span className="shrink-0 rounded border bg-background/70 px-2 py-1 text-sm">
            {winnerId ? getPlayerName(winnerId, playerMap) : "Unknown"}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {historyOpen && <div className="flex flex-wrap items-center gap-1.5">{renderHistoryControls()}</div>}
          <TooltipProvider>
            {!historyOpen && isMyTurn && phase === "Reinforcement" && (
              <Button
                type="button"
                size="sm"
                title="Confirm placements (Cmd/Ctrl+Enter)"
                disabled={controlsDisabled || reinforcementDrafts.length === 0}
                onClick={() => void handleConfirmPlacements()}
                className="action-cta"
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
                className="action-cta"
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
                className="action-cta"
              >
                End Turn
                <ShortcutHint shortcut="mod+enter" />
              </Button>
            )}
            {!isSpectator && !historyOpen && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    type="button"
                    className="relative"
                    aria-label="Open cards"
                    onClick={() => setCardsOpen(true)}
                  >
                    <Layers className="size-4" aria-hidden="true" />
                    <span className="absolute -right-1 -top-1 rounded-full border border-border/70 bg-background px-1 text-[10px] font-semibold">
                      {myCardCount}
                    </span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open cards (C)</TooltipContent>
              </Tooltip>
            )}
            {historyOpen && (
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button size="icon-sm" variant="outline" aria-label="Open timeline scrubber">
                        <SlidersHorizontal className="size-4" aria-hidden="true" />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Timeline scrubber</TooltipContent>
                </Tooltip>
                <PopoverContent align="end" side="bottom" className="w-[min(90vw,420px)] p-3">
                  {renderHistoryScrubber()}
                </PopoverContent>
              </Popover>
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

      <div className="page-container max-w-none flex flex-1 flex-col gap-4 game-body">
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
                graphEdgeMode={showActionEdges || !!historyAttackEdgeIds || !!recentAttackEdgeIds ? "action" : "none"}
                actionEdgeIds={historyAttackEdgeIds ?? recentAttackEdgeIds ?? fortifyConnectedEdgeIds}
                interactive={!historyOpen && isMyTurn}
                troopDeltaDurationMs={TROOP_DELTA_DURATION_MS}
                showTroopDeltas={!suppressTroopDeltas}
                maxHeight={MAP_MAX_HEIGHT}
                onClickTerritory={handleTerritoryClick}
                onImageRectChange={(rect) => {
                  setMapImageWidth(rect.width > 0 ? rect.width : null);
                }}
                onClearSelection={() => {
                  stopAutoAttack();
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
                      onSubmitOccupyAll: () => {
                        void submitAction({ type: "Occupy", moveArmies: state.pending?.maxMove ?? occupyMove });
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
                        onSubmitFortifyAll: () => {
                          void submitAction({
                            type: "Fortify",
                            from: selectedFrom as TerritoryId,
                            to: selectedTo as TerritoryId,
                            count: Math.max(1, (state.territories[selectedFrom]?.armies ?? 2) - 1),
                          });
                        },
                        onCancelSelection: () => {
                          stopAutoAttack();
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
                          maxDice: Math.max(0, Math.min(3, (state.territories[selectedFrom]?.armies ?? 2) - 1)),
                          autoRunning: autoAttacking,
                          resolving: attackSubmitting,
                          disabled: controlsDisabled,
                          onSetAttackDice: setAttackDice,
                          onResolveAttack: handleResolveAttack,
                          onAutoAttack: handleAutoAttackToggle,
                          onStopAutoAttack: stopAutoAttack,
                          onCancelSelection: () => {
                            stopAutoAttack();
                            setSelectedFrom(null);
                            setSelectedTo(null);
                          },
                        }
                        : null
                }
              />
            </div>
            <div
              className={`hidden min-h-0 shrink-0 overflow-hidden transition-[width,transform,opacity] duration-220 ease-out [@media(orientation:landscape)]:flex ${historyOpen
                ? "w-[min(34vw,300px)] translate-x-0 opacity-100"
                : "pointer-events-none w-0 translate-x-10 opacity-0"
                }`}
              style={{
                height: mapPanelHeight ?? MAP_MAX_HEIGHT,
                maxHeight: MAP_MAX_HEIGHT,
              }}
              aria-hidden={!historyOpen}
            >
              <div className="h-full min-h-0 w-[min(34vw,300px)] overflow-hidden">
                <GameEventsCard
                  events={historyEvents}
                  activeIndex={activeHistoryEventIndex}
                  onSelectEvent={(index) => {
                    const frameIndex = historyFrames.findIndex((frame) => frame.index === index);
                    if (frameIndex < 0) return;
                    setHistoryFrameIndex(frameIndex);
                    setHistoryPlaying(false);
                  }}
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
                  onSelectEvent={(index) => {
                    const frameIndex = historyFrames.findIndex((frame) => frame.index === index);
                    if (frameIndex < 0) return;
                    setHistoryFrameIndex(frameIndex);
                    setHistoryPlaying(false);
                  }}
                />
              </div>
            )}
            <div className="space-y-4">
              <GamePlayersCard
                playerStats={playerStats}
                displayState={resolvedDisplayState}
                playerMap={playerMap}
                teamModeEnabled={!!view.teamModeEnabled}
                teamNames={teamNames}
                showTurnTimer={showTurnTimer}
                turnTimerLabel={turnTimerLabel}
                activeHighlight={highlightFilter}
                onTogglePlayerHighlight={handleTogglePlayerHighlight}
                onToggleTeamHighlight={handleToggleTeamHighlight}
                getPlayerColor={resolvePlayerColor}
                getPlayerName={getPlayerName}
                myPlayerId={myEnginePlayerId}
                canResign={!isSpectator && !historyOpen}
                onResign={handleResign}
              />
            </div>
            <div className="xl:order-last">
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

      <div className="fixed bottom-4 right-4 z-40">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={shortcutsOpen ? "default" : "outline"}
                size="icon-sm"
                type="button"
                aria-label="Toggle keyboard shortcuts"
                onClick={() => setShortcutsOpen((prev) => !prev)}
              >
                ?
              </Button>
            </TooltipTrigger>
            <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {shortcutsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/65 p-4 backdrop-blur-[1px]">
          <Card className="glass-panel w-full max-w-md border border-border/70 py-0 shadow-xl">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-base font-semibold">Keyboard Shortcuts</p>
                  <p className="text-sm text-muted-foreground">Quick controls for your turn.</p>
                </div>
                <Button size="xs" variant="outline" type="button" onClick={() => setShortcutsOpen(false)}>
                  Close
                </Button>
              </div>
              <div className="space-y-1.5 text-sm">
                <p><span className="font-semibold">1-9</span>: Set active troop/dice count</p>
                <p><span className="font-semibold">↑/↓</span>: Increase or decrease troop/dice counts</p>
                <p><span className="font-semibold">U</span>: Undo last placement</p>
                <p><span className="font-semibold">C</span>: Open cards</p>
                <p><span className="font-semibold">?</span>: Toggle this help</p>
                <p><span className="font-semibold">H</span>: Toggle history</p>
                <p><span className="font-semibold">Cmd/Ctrl + Enter</span>: Confirm or end phase</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${selected
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
                {autoTradeCardIds && (
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

      {endgameModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 p-4 backdrop-blur-[2px]">
          <Card className="glass-panel w-full max-w-sm border border-border/70 py-0 shadow-xl">
            <CardContent className="space-y-4 p-5">
              <div className="space-y-1">
                <p className="text-base font-semibold">
                  {endgameModal === "won" ? "You won!" : "You have been eliminated"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {endgameModal === "won" ? "Victory is yours." : "You are out of the match."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {endgameModal === "won" ? (
                  <Button asChild size="sm">
                    <Link to="/">Go Home</Link>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    dismissedEndgameRef.current = true;
                    setEndgameModal(null);
                  }}
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
