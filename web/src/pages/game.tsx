import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useLocation, useParams } from "react-router-dom";
import type { Id } from "@backend/_generated/dataModel";
import { defaultRuleset } from "risk-engine";
import type { Action, CardId, TerritoryId } from "risk-engine";
import { authClient } from "@/lib/auth-client";
import { adaptMapDoc, adaptView } from "@/lib/game/adapters";
import { getPlayerColor, getPlayerName } from "@/lib/game/display";
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
import { ROTATING_HINTS } from "@/lib/game/rotating-hints";
import { territorySignature } from "@/lib/game/history-debug";
import { findAutoTradeSet, type TradeSetsConfig } from "@/lib/game/trade-cards";
import { formatTurnTimer } from "@/lib/game/turn-timer";
import { useGameActions } from "@/lib/game/use-game-actions";
import { useGameRuntimeQueries, useGameViewQueries } from "@/lib/game/use-game-queries";
import { useGameShortcuts } from "@/lib/game/use-game-shortcuts";
import { HistoryScrubber } from "@/components/game/history-scrubber";
import { GameHeader } from "@/pages/game/components/GameHeader";
import { GameMapSection } from "@/pages/game/components/GameMapSection";
import { GameModals } from "@/pages/game/components/GameModals";
import { GameSidePanels } from "@/pages/game/components/GameSidePanels";
import { useEndgameModal } from "@/pages/game/hooks/use-endgame-modal";
import { useGameAutoAttack } from "@/pages/game/hooks/use-game-auto-attack";
import { useGameHistory } from "@/pages/game/hooks/use-game-history";
import { useGameOccupy } from "@/pages/game/hooks/use-game-occupy";
import { useMapPanelSize } from "@/pages/game/hooks/use-map-panel-size";
import { useRotatingHints } from "@/pages/game/hooks/use-rotating-hints";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const HINT_ROTATION_MS = 18000;
const ACTION_BUTTON_COOLDOWN_MS = 1000;

export default function GamePage() {
  const HISTORY_PLAYBACK_INTERVAL_MS = 840;
  const TROOP_DELTA_DURATION_MS = Math.round(HISTORY_PLAYBACK_INTERVAL_MS * 1.25);
  const MAP_MAX_HEIGHT = "min(88vh, calc(100vh - 7rem))";
  const MAP_FULLSCREEN_MAX_HEIGHT = "100%";
  const { gameId } = useParams<{ gameId: string }>();
  const location = useLocation();
  const historyDebugEnabled = useMemo(() => {
    if (new URLSearchParams(location.search).get("historyDebug") === "1") return true;
    if (typeof window === "undefined") return false;
    return (window as { __RISK_HISTORY_DEBUG?: boolean }).__RISK_HISTORY_DEBUG === true;
  }, [location.search]);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { mapPanelRef, mapPanelHeight, mapPanelWidth } = useMapPanelSize();
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
  const [fortifyCount, setFortifyCount] = useState(1);
  const [reinforcementDrafts, setReinforcementDrafts] = useState<ReinforcementDraft[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [cardsOpen, setCardsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [infoOverlayEnabled, setInfoOverlayEnabled] = useState(false);
  const [infoPinnedTerritoryId, setInfoPinnedTerritoryId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attackSubmitting, setAttackSubmitting] = useState(false);
  const [recentAttackEdgeIds, setRecentAttackEdgeIds] = useState<Set<string> | null>(null);
  const recentAttackEventRef = useRef<string | null>(null);
  const recentAttackTimeoutRef = useRef<number | null>(null);
  const [suppressTroopDeltas, setSuppressTroopDeltas] = useState(false);
  const [highlightFilter, setHighlightFilter] = useState<HighlightFilter>("none");
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [actionButtonCooldownActive, setActionButtonCooldownActive] = useState(false);
  const autoEndFortifyVersionRef = useRef<number | null>(null);
  const optionalTradeAutoOpenRef = useRef<number | null>(null);
  const actionInFlightRef = useRef(false);
  const troopDeltaResumeTimeoutRef = useRef<number | null>(null);
  const historyDebugRef = useRef<{ framePos: number; signature: string; staleRun: number } | null>(null);
  const teamChatDefaultAppliedRef = useRef(false);
  const actionButtonCooldownTimeoutRef = useRef<number | null>(null);
  const stopAutoAttackRef = useRef<() => void>(() => undefined);
  const setOccupyMoveRef = useRef<Dispatch<SetStateAction<number>>>(() => undefined);

  const phase = state?.turn.phase ?? "GameOver";
  const isSpectator = !myEnginePlayerId;
  const isMyTurn = !!myEnginePlayerId && !!state && state.turn.currentPlayerId === myEnginePlayerId;
  const {
    historyOpen,
    setHistoryOpen,
    historyPlaying,
    setHistoryPlaying,
    historyFrameIndex,
    setHistoryFrameIndex,
    historyFrames,
    historyEvents,
    historyMaxIndex,
    historyAtEnd,
    historyAttackEdgeIds,
    activeHistoryEventIndex,
    historyCount,
  } = useGameHistory({
    historyTimeline,
    timelineActions,
    graphMap,
    playerMap,
    myEnginePlayerId: myEnginePlayerId ?? undefined,
    playbackIntervalMs: HISTORY_PLAYBACK_INTERVAL_MS,
  });
  const controlsDisabled = !isMyTurn || isSpectator || submitting || historyOpen;
  const canSetOccupyShortcut =
    !!state?.pending &&
    (phase === "Occupy" || (phase === "Attack" && !!state?.pending)) &&
    isMyTurn &&
    !historyOpen;
  const { hintIndex, rotateHintForward, rotateHintBack } = useRotatingHints({
    hints: ROTATING_HINTS,
    rotationMs: HINT_ROTATION_MS,
  });
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
    cards?: {
      forcedTradeHandSize?: number;
      tradeSets?: TradeSetsConfig;
      tradeValues?: number[];
      tradeValueOverflow?: "repeatLast" | "continueByFive";
    };
    fortify?: { maxFortifiesPerTurn?: number; fortifyMode?: "adjacent" | "connected" };
  } | null;
  const effectiveCards = effectiveRuleset?.cards;
  const effectiveFortify = effectiveRuleset?.fortify;
  const forcedTradeHandSize = effectiveCards?.forcedTradeHandSize ?? defaultRuleset.cards.forcedTradeHandSize;
  const tradeSets = effectiveCards?.tradeSets ?? defaultRuleset.cards.tradeSets;
  const tradeValues = effectiveCards?.tradeValues ?? [...defaultRuleset.cards.tradeValues];
  const tradeValueOverflow = effectiveCards?.tradeValueOverflow ?? defaultRuleset.cards.tradeValueOverflow;
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
  const {
    endgameModal,
    setEndgameModal,
    dismissedEndgameRef,
  } = useEndgameModal({
    state,
    historyOpen,
    isSpectator,
    isWinner,
    myEnginePlayerId: myEnginePlayerId ?? undefined,
  });
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
        if (territory.ownerId === myEnginePlayerId && territory.armies >= 2) {
          ids.add(territoryId);
        }
      }
    }

    return ids;
  }, [
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
        setOccupyMoveRef.current(1);
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
        stopAutoAttackRef.current();
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

  const {
    autoAttacking,
    setAutoAttacking,
    stopAutoAttack,
    autoAttackSubmittedVersionRef,
  } = useGameAutoAttack({
    state,
    isMyTurn,
    historyOpen,
    phase,
    selectedFrom,
    selectedTo,
    submitting,
    validToIds,
    submitAction,
  });

  const { occupyMove, setOccupyMove } = useGameOccupy({
    pending: state?.pending,
    isMyTurn,
    historyOpen,
    controlsDisabled,
    phase,
    submitAction,
  });
  stopAutoAttackRef.current = stopAutoAttack;
  setOccupyMoveRef.current = setOccupyMove;

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

  const reinforcementDraftTerritoryIds = useMemo(() => {
    return new Set(reinforcementDrafts.map((draft) => draft.territoryId));
  }, [reinforcementDrafts]);

  const handleTerritoryRightClick = useCallback(
    (territoryId: string) => {
      if (!state || controlsDisabled) return;
      if (state.turn.phase !== "Reinforcement") return;
      if (mustTradeNow) return;
      setReinforcementDrafts((prev) => {
        const index = (() => {
          for (let i = prev.length - 1; i >= 0; i -= 1) {
            if (prev[i]?.territoryId === territoryId && prev[i].count > 0) return i;
          }
          return -1;
        })();
        if (index < 0) return prev;
        const entry = prev[index];
        if (!entry) return prev;
        if (entry.count === 1) return [...prev.slice(0, index), ...prev.slice(index + 1)];
        return [
          ...prev.slice(0, index),
          { ...entry, count: entry.count - 1 },
          ...prev.slice(index + 1),
        ];
      });
    },
    [controlsDisabled, mustTradeNow, state],
  );

  const handleConfirmPlacements = useCallback(async () => {
    if (!typedGameId || !state || reinforcementDrafts.length === 0 || mustTradeNow || actionButtonCooldownActive) {
      return;
    }
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
  }, [
    actionButtonCooldownActive,
    mustTradeNow,
    reinforcementDrafts,
    state,
    submitReinforcementPlacementsMutation,
    typedGameId,
  ]);

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
    if (!state || !isMyTurn || historyOpen) {
      setActionButtonCooldownActive(false);
      if (actionButtonCooldownTimeoutRef.current !== null) {
        window.clearTimeout(actionButtonCooldownTimeoutRef.current);
        actionButtonCooldownTimeoutRef.current = null;
      }
      return;
    }

    setActionButtonCooldownActive(true);
    if (actionButtonCooldownTimeoutRef.current !== null) {
      window.clearTimeout(actionButtonCooldownTimeoutRef.current);
    }
    actionButtonCooldownTimeoutRef.current = window.setTimeout(() => {
      setActionButtonCooldownActive(false);
      actionButtonCooldownTimeoutRef.current = null;
    }, ACTION_BUTTON_COOLDOWN_MS);
  }, [historyOpen, isMyTurn, state, state?.stateVersion]);

  useEffect(() => {
    return () => {
      if (actionButtonCooldownTimeoutRef.current !== null) {
        window.clearTimeout(actionButtonCooldownTimeoutRef.current);
      }
    };
  }, []);

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
  }, [autoAttackSubmittedVersionRef, autoAttacking, setAutoAttacking, stopAutoAttack]);

  const handleEndAttackPhase = useCallback(() => {
    if (actionButtonCooldownActive) return;
    stopAutoAttack();
    void submitAction({ type: "EndAttackPhase" });
  }, [actionButtonCooldownActive, stopAutoAttack, submitAction]);

  const handleEndTurn = useCallback(() => {
    if (actionButtonCooldownActive) return;
    void submitAction({ type: "EndTurn" });
  }, [actionButtonCooldownActive, submitAction]);

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
    const isEditing = Boolean(chatEditingMessageId);
    const draftBeforeSubmit = chatDraft;

    if (!isEditing) {
      setChatDraft("");
    }

    try {
      if (isEditing) {
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
      if (isEditing) {
        setChatDraft("");
        setChatEditingMessageId(null);
      }
    } catch (error) {
      if (!isEditing) {
        setChatDraft((currentDraft) => (currentDraft === "" ? draftBeforeSubmit : currentDraft));
      }
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

  const resolvePlayerColor = useCallback(
    (playerId: string, turnOrder: string[]) => getPlayerColor(playerId, playerMap, turnOrder),
    [playerMap],
  );

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!historyOpen) return;
    setInfoOverlayEnabled(false);
    setInfoPinnedTerritoryId(null);
    stopAutoAttack();
    setSelectedFrom(null);
    setSelectedTo(null);
  }, [historyOpen, stopAutoAttack]);

  useEffect(() => {
    if (canUseTeamChat && !teamChatDefaultAppliedRef.current) {
      setChatChannel("team");
      teamChatDefaultAppliedRef.current = true;
      return;
    }
    if (!canUseTeamChat) {
      teamChatDefaultAppliedRef.current = false;
    }
  }, [canUseTeamChat]);

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
    onToggleHistory: () => {
      if (isMapFullscreen) return;
      setHistoryOpen((prev) => !prev);
    },
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
    onToggleInfoOverlay: () => {
      if (!historyOpen) {
        setInfoOverlayEnabled((prev) => !prev);
      }
    },
    onUndoPlacement: handleUndoPlacement,
  });

  const displayState = historyOpen ? (historyFrames[historyFrameIndex]?.state ?? state) : state;
  const highlightedTerritoryIds = useMemo(
    () => (displayState ? resolveHighlightedTerritoryIds(displayState, highlightFilter) : new Set<string>()),
    [displayState, highlightFilter],
  );
  const playerStats = useMemo(() => (displayState ? buildPlayerPanelStats(displayState) : []), [displayState]);

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
    if (historyOpen) {
      if (recentAttackTimeoutRef.current !== null) {
        window.clearTimeout(recentAttackTimeoutRef.current);
        recentAttackTimeoutRef.current = null;
      }
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
      if (recentAttackTimeoutRef.current !== null) {
        window.clearTimeout(recentAttackTimeoutRef.current);
      }
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMapFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!isMapFullscreen) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isMapFullscreen]);

  useEffect(() => {
    if (!isMapFullscreen) return;
    if (!historyOpen) return;
    setHistoryOpen(false);
    setHistoryPlaying(false);
  }, [historyOpen, isMapFullscreen, setHistoryOpen, setHistoryPlaying]);

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
  const winnerName = winnerId ? getPlayerName(winnerId, playerMap) : "Unknown";
  const onSelectHistoryEvent = (index: number) => {
    const frameIndex = historyFrames.findIndex((frame) => frame.index === index);
    if (frameIndex < 0) return;
    setHistoryFrameIndex(frameIndex);
    setHistoryPlaying(false);
  };
  const battleOverlay =
    !historyOpen && isMyTurn && (phase === "Occupy" || (phase === "Attack" && !!state.pending)) && state.pending
      ? {
        mode: "occupy" as const,
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
          mode: "fortify" as const,
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
            mode: "attack" as const,
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
          : null;

  return (
    <div
      className={cn(
        "page-shell soft-grid game-shell overflow-x-hidden md:overflow-x-visible",
        isMapFullscreen && "game-map-fullscreen-shell flex h-dvh flex-col overflow-hidden md:overflow-hidden",
      )}
    >
      <GameHeader
        phaseTitle={phaseCopy.title}
        actionHint={actionHint}
        historyOpen={historyOpen}
        isMyTurn={isMyTurn}
        phase={phase}
        hasPendingAttack={!!state.pending}
        displayPhase={displayPhase}
        uncommittedReinforcements={uncommittedReinforcements}
        fortifyRemainingLabel={fortifyRemainingLabel}
        currentTurnPlayerName={getPlayerName(resolvedDisplayState.turn.currentPlayerId, playerMap)}
        showSignInCta={showSignInCta}
        loginHref={loginHref}
        currentHint={currentHint}
        onRotateHintForward={rotateHintForward}
        onRotateHintBack={rotateHintBack}
        controlsDisabled={controlsDisabled}
        placeCount={placeCount}
        reinforcementDraftCount={reinforcementDrafts.length}
        onDecreasePlaceCount={() => setPlaceCount((prev) => Math.max(1, prev - 1))}
        onIncreasePlaceCount={() => setPlaceCount((prev) => Math.min(Math.max(1, uncommittedReinforcements), prev + 1))}
        onUndoPlacement={handleUndoPlacement}
        winnerName={winnerName}
        historyFrameIndex={historyFrameIndex}
        historyCount={historyCount}
        historyMaxIndex={historyMaxIndex}
        historyAtEnd={historyAtEnd}
        historyPlaying={historyPlaying}
        onHistoryFrameIndexChange={setHistoryFrameIndex}
        onToggleHistoryPlaying={() => setHistoryPlaying((prev) => !prev)}
        onResetHistory={() => {
          setHistoryFrameIndex(0);
          setHistoryPlaying(false);
        }}
        cardsOpenDisabled={isSpectator || historyOpen}
        myCardCount={myCardCount}
        onOpenCards={() => setCardsOpen(true)}
        infoOpen={infoOverlayEnabled}
        onToggleInfo={() => {
          if (!historyOpen) {
            setInfoOverlayEnabled((prev) => !prev);
            setInfoPinnedTerritoryId(null);
          }
        }}
        onToggleHistory={() => {
          if (isMapFullscreen) return;
          setHistoryOpen((prev) => !prev);
          setHistoryPlaying(false);
        }}
        historyToggleDisabled={historyCount === 0}
        isMapFullscreen={isMapFullscreen}
        showBackHome={!isMyTurn}
        renderHistoryScrubber={() => (
          <HistoryScrubber
            min={0}
            max={historyMaxIndex}
            value={historyFrameIndex}
            onChange={(value) => {
              setHistoryFrameIndex(value);
              setHistoryPlaying(false);
            }}
          />
        )}
        onConfirmPlacements={() => {
          void handleConfirmPlacements();
        }}
        onEndAttackPhase={handleEndAttackPhase}
        actionButtonsDisabled={actionButtonCooldownActive}
        onEndTurn={handleEndTurn}
      />

      <div
        className={cn(
          "page-container max-w-none flex flex-1 flex-col gap-4 game-body",
          isMapFullscreen && "min-h-0 flex-1 gap-0 overflow-hidden p-0 md:p-0",
        )}
      >
        <GameMapSection
          mapPanelRef={mapPanelRef}
          mapPanelHeight={mapPanelHeight}
          mapPanelWidth={mapPanelWidth}
          mapImageWidth={mapImageWidth}
          mapMaxHeight={isMapFullscreen ? MAP_FULLSCREEN_MAX_HEIGHT : MAP_MAX_HEIGHT}
          graphMap={graphMap}
          mapVisual={mapVisual}
          mapImageUrl={mapImageUrl}
          playbackTerritories={playbackTerritories}
          resolvedDisplayState={resolvedDisplayState}
          mapSelectedFrom={mapSelectedFrom}
          mapSelectedTo={mapSelectedTo}
          isMapFullscreen={isMapFullscreen}
          historyOpen={historyOpen}
          isMyTurn={isMyTurn}
          validFromIds={validFromIds}
          validToIds={validToIds}
          highlightedTerritoryIds={highlightedTerritoryIds}
          showActionEdges={showActionEdges}
          historyAttackEdgeIds={historyAttackEdgeIds}
          recentAttackEdgeIds={recentAttackEdgeIds}
          fortifyConnectedEdgeIds={fortifyConnectedEdgeIds}
          infoOverlayEnabled={infoOverlayEnabled}
          infoPinnedTerritoryId={infoPinnedTerritoryId}
          onSetInfoPinnedTerritoryId={setInfoPinnedTerritoryId}
          troopDeltaDurationMs={TROOP_DELTA_DURATION_MS}
          suppressTroopDeltas={suppressTroopDeltas}
          onTerritoryClick={handleTerritoryClick}
          onTerritoryRightClick={handleTerritoryRightClick}
          rightClickableTerritoryIds={reinforcementDraftTerritoryIds}
          onMapImageRectChange={(rect) => {
            setMapImageWidth(rect.width > 0 ? rect.width : null);
          }}
          onClearSelection={() => {
            stopAutoAttack();
            setSelectedFrom(null);
            setSelectedTo(null);
          }}
          onToggleFullscreen={() => setIsMapFullscreen((prev) => !prev)}
          getPlayerColor={resolvePlayerColor}
          battleOverlay={battleOverlay}
          historyEvents={historyEvents}
          activeHistoryEventIndex={activeHistoryEventIndex}
          onSelectHistoryEvent={onSelectHistoryEvent}
        />
        {!isMapFullscreen && (
          <div
            className="mx-auto grid w-full min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
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
            <GameSidePanels
              playerStats={playerStats}
              resolvedDisplayState={resolvedDisplayState}
              playerMap={playerMap}
              teamModeEnabled={!!view.teamModeEnabled}
              teamNames={teamNames}
              showTurnTimer={showTurnTimer}
              turnTimerLabel={turnTimerLabel}
              highlightFilter={highlightFilter}
              onTogglePlayerHighlight={handleTogglePlayerHighlight}
              onToggleTeamHighlight={handleToggleTeamHighlight}
              getPlayerColor={resolvePlayerColor}
              getPlayerName={getPlayerName}
              myEnginePlayerId={myEnginePlayerId ?? undefined}
              canResign={!isSpectator && !historyOpen}
              onResign={handleResign}
              chatMessages={chatMessages ?? []}
              chatChannel={chatChannel}
              canUseTeamChat={canUseTeamChat}
              myTeamName={myTeamName}
              canSendChat={canSendChat}
              chatDraft={chatDraft}
              chatEditingMessageId={chatEditingMessageId}
              onSetChatDraft={setChatDraft}
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
              onSendMessage={() => {
                void handleSendChatMessage();
              }}
            />
          </div>
        )}
      </div>
      <GameModals
        shortcutsOpen={shortcutsOpen}
        onToggleShortcuts={() => setShortcutsOpen((prev) => !prev)}
        onCloseShortcuts={() => setShortcutsOpen(false)}
        cardsOpen={cardsOpen}
        myHand={myHand}
        myCardCount={myCardCount}
        selectedCardIds={selectedCardIds}
        onToggleCard={toggleCard}
        mustTradeNow={mustTradeNow}
        forcedTradeHandSize={forcedTradeHandSize}
        tradeValues={tradeValues}
        tradeValueOverflow={tradeValueOverflow}
        tradesCompleted={state?.tradesCompleted ?? 0}
        onCloseCards={() => setCardsOpen(false)}
        controlsDisabled={controlsDisabled}
        phase={phase}
        submitting={submitting}
        autoTradeCardIds={autoTradeCardIds}
        onTrade={handleTrade}
        onAutoTrade={(cardIds) => {
          void submitAction({ type: "TradeCards", cardIds });
        }}
        endgameModal={endgameModal}
        onDismissEndgame={() => {
          dismissedEndgameRef.current = true;
          setEndgameModal(null);
        }}
      />
    </div>
  );
}
