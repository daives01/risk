/* eslint-disable react-hooks/set-state-in-effect */
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { mergeHistoryWindowActions, reconstructHistoryWindows } from "@/lib/game/history-timeline";
import { resolveReplayWindowBeforeIndex, trimReplayWindowCache } from "@/lib/game/replay-window-policy";
import type { GameAction, HistoryWindow } from "@/lib/game/types";

function getHistoryWindowKey(window: HistoryWindow) {
  const lastActionIndex = window.actions.at(-1)?.index ?? window.snapshotIndex ?? -1;
  return `${window.snapshotIndex ?? "none"}:${lastActionIndex}`;
}

export function useReplayWindows(
  typedGameId: Id<"games"> | undefined,
  replayEnabled: boolean,
) {
  const [historyWindowsByKey, setHistoryWindowsByKey] = useState<Record<string, HistoryWindow>>({});
  const [olderHistoryBeforeIndex, setOlderHistoryBeforeIndex] = useState<number | null>(null);
  const [targetHistoryBeforeIndex, setTargetHistoryBeforeIndex] = useState<number | null>(null);
  const historySummary = useQuery(
    api.gameplay.getHistorySummary,
    typedGameId ? { gameId: typedGameId } : "skip",
  );

  const latestHistoryWindow = useQuery(
    api.gameplay.getHistoryWindow,
    typedGameId && replayEnabled ? { gameId: typedGameId } : "skip",
  ) as HistoryWindow | undefined;

  const previousHistoryBeforeIndex =
    typeof latestHistoryWindow?.snapshotIndex === "number" && latestHistoryWindow.snapshotIndex > -1
      ? latestHistoryWindow.snapshotIndex
      : null;

  const previousHistoryWindow = useQuery(
    api.gameplay.getHistoryWindow,
    typedGameId && replayEnabled && previousHistoryBeforeIndex !== null
      ? { gameId: typedGameId, beforeIndex: previousHistoryBeforeIndex }
      : "skip",
  ) as HistoryWindow | undefined;

  const olderHistoryWindow = useQuery(
    api.gameplay.getHistoryWindow,
    typedGameId && replayEnabled && olderHistoryBeforeIndex !== null
      ? { gameId: typedGameId, beforeIndex: olderHistoryBeforeIndex }
      : "skip",
  ) as HistoryWindow | undefined;

  const targetHistoryWindow = useQuery(
    api.gameplay.getHistoryWindow,
    typedGameId && replayEnabled && targetHistoryBeforeIndex !== null
      ? { gameId: typedGameId, beforeIndex: targetHistoryBeforeIndex }
      : "skip",
  ) as HistoryWindow | undefined;

  useEffect(() => {
    if (!replayEnabled) {
      setHistoryWindowsByKey({});
      setOlderHistoryBeforeIndex(null);
      setTargetHistoryBeforeIndex(null);
    }
  }, [replayEnabled]);

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
        const key = getHistoryWindowKey(window);
        if (next[key] === window) continue;
        next[key] = window;
        changed = true;
      }
      return changed ? trimReplayWindowCache(next) : prev;
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
    const beforeIndex = resolveReplayWindowBeforeIndex({
      framePosition: index,
      latestActionIndex: historySummary?.latestActionIndex,
    });
    if (beforeIndex === null) return;
    setTargetHistoryBeforeIndex(beforeIndex);
  }, [historySummary?.latestActionIndex]);

  return {
    historySummary,
    historyTimeline,
    timelineActions,
    canLoadOlderHistory,
    historyLoadingOlder,
    loadOlderHistory,
    loadHistoryAroundIndex,
  };
}
