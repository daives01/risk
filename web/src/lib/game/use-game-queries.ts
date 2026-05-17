/* eslint-disable react-hooks/set-state-in-effect */
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { mergeHistoryWindowActions, reconstructHistoryWindows } from "@/lib/game/history-timeline";
import type { ChatMessage, GameAction, HistoryWindow } from "@/lib/game/types";

const HISTORY_WINDOW_SIZE = 100;

export function useGameViewQueries(
  session: unknown,
  sessionPending: boolean,
  typedGameId: Id<"games"> | undefined,
) {
  const playerView = useQuery(
    api.games.getGameViewAsPlayer,
    session && typedGameId ? { gameId: typedGameId } : "skip",
  );
  const publicView = useQuery(
    api.games.getGameView,
    !sessionPending && !session && typedGameId ? { gameId: typedGameId } : "skip",
  );

  return {
    playerView,
    publicView,
  };
}

export function useGameRuntimeQueries(
  typedGameId: Id<"games"> | undefined,
  isAuthenticated: boolean,
  historyEnabled: boolean,
  mapId?: string,
) {
  const [historyWindowsByKey, setHistoryWindowsByKey] = useState<Record<string, HistoryWindow>>({});
  const [olderHistoryBeforeIndex, setOlderHistoryBeforeIndex] = useState<number | null>(null);
  const [targetHistoryBeforeIndex, setTargetHistoryBeforeIndex] = useState<number | null>(null);
  const mapDoc = useQuery(api.maps.getByMapId, mapId ? { mapId } : "skip");
  const historySummary = useQuery(
    api.gameplay.getHistorySummary,
    typedGameId ? { gameId: typedGameId } : "skip",
  );

  const latestHistoryWindow = useQuery(
    api.gameplay.getHistoryWindow,
    typedGameId && historyEnabled ? { gameId: typedGameId } : "skip",
  ) as HistoryWindow | undefined;

  const previousHistoryBeforeIndex =
    typeof latestHistoryWindow?.snapshotIndex === "number" && latestHistoryWindow.snapshotIndex > -1
      ? latestHistoryWindow.snapshotIndex
      : null;

  const previousHistoryWindow = useQuery(
    api.gameplay.getHistoryWindow,
    typedGameId && historyEnabled && previousHistoryBeforeIndex !== null
      ? { gameId: typedGameId, beforeIndex: previousHistoryBeforeIndex }
      : "skip",
  ) as HistoryWindow | undefined;

  const olderHistoryWindow = useQuery(
    api.gameplay.getHistoryWindow,
    typedGameId && historyEnabled && olderHistoryBeforeIndex !== null
      ? { gameId: typedGameId, beforeIndex: olderHistoryBeforeIndex }
      : "skip",
  ) as HistoryWindow | undefined;

  const targetHistoryWindow = useQuery(
    api.gameplay.getHistoryWindow,
    typedGameId && historyEnabled && targetHistoryBeforeIndex !== null
      ? { gameId: typedGameId, beforeIndex: targetHistoryBeforeIndex }
      : "skip",
  ) as HistoryWindow | undefined;

  useEffect(() => {
    if (!historyEnabled) {
      setHistoryWindowsByKey({});
      setOlderHistoryBeforeIndex(null);
      setTargetHistoryBeforeIndex(null);
    }
  }, [historyEnabled]);

  useEffect(() => {
    setHistoryWindowsByKey({});
    setOlderHistoryBeforeIndex(null);
    setTargetHistoryBeforeIndex(null);
  }, [typedGameId]);

  useEffect(() => {
    const windows = [latestHistoryWindow, previousHistoryWindow, olderHistoryWindow, targetHistoryWindow].filter(
      (window): window is HistoryWindow => !!window?.snapshotPublicState,
    );
    if (windows.length === 0) return;

    setHistoryWindowsByKey((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const window of windows) {
        const lastActionIndex = window.actions.at(-1)?.index ?? window.snapshotIndex ?? -1;
        const key = `${window.snapshotIndex ?? "none"}:${lastActionIndex}`;
        if (next[key] === window) continue;
        next[key] = window;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [latestHistoryWindow, olderHistoryWindow, previousHistoryWindow, targetHistoryWindow]);

  const historyWindows = useMemo(() => Object.values(historyWindowsByKey), [historyWindowsByKey]);

  const historyTimeline = useMemo(
    () => reconstructHistoryWindows(historyWindows),
    [historyWindows],
  );

  const timelineActions = useMemo(
    () =>
      mergeHistoryWindowActions(historyWindows).map((action) => ({
        _id: action._id,
        index: action.index,
        events: action.events ?? [],
        publicStatePatch: action.publicStatePatch,
      })) satisfies GameAction[],
    [historyWindows],
  );

  const earliestLoadedHistoryIndex = historyTimeline[0]?.index ?? null;
  const canLoadOlderHistory =
    earliestLoadedHistoryIndex !== null &&
    earliestLoadedHistoryIndex > -1 &&
    historyWindows.some((window) => window.hasPrevious);
  const historyLoadingOlder =
    olderHistoryBeforeIndex !== null &&
    earliestLoadedHistoryIndex !== null &&
    olderHistoryBeforeIndex <= earliestLoadedHistoryIndex;
  const loadOlderHistory = useCallback(() => {
    if (earliestLoadedHistoryIndex === null || earliestLoadedHistoryIndex <= -1) return;
    setOlderHistoryBeforeIndex(earliestLoadedHistoryIndex);
  }, [earliestLoadedHistoryIndex]);
  const loadHistoryAroundIndex = useCallback((index: number) => {
    if (!Number.isFinite(index)) return;
    const latestActionIndex = historySummary?.latestActionIndex;
    if (typeof latestActionIndex !== "number") return;
    const actionIndex = Math.max(-1, Math.floor(index) - 1);
    if (actionIndex < 0) {
      setTargetHistoryBeforeIndex(0);
      return;
    }
    const windowEnd = Math.min(
      latestActionIndex,
      Math.floor(actionIndex / HISTORY_WINDOW_SIZE) * HISTORY_WINDOW_SIZE + HISTORY_WINDOW_SIZE - 1,
    );
    setTargetHistoryBeforeIndex(windowEnd + 1);
  }, [historySummary?.latestActionIndex]);

  const chatMessages = useQuery(
    api.gameChat.listVisibleMessages,
    typedGameId && isAuthenticated
      ? {
          gameId: typedGameId,
          limit: 60,
        }
      : "skip",
  ) as ChatMessage[] | undefined;

  return {
    mapDoc,
    historySummary,
    historyTimeline,
    timelineActions,
    canLoadOlderHistory,
    historyLoadingOlder,
    loadOlderHistory,
    loadHistoryAroundIndex,
    chatMessages,
  };
}
