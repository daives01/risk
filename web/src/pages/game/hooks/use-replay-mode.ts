/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Id } from "@backend/_generated/dataModel";
import { useReplayWindows } from "@/lib/game/use-replay-windows";
import { useGameHistory } from "@/pages/game/hooks/use-game-history";

const MISSING_HISTORY_FRAME_LOAD_DELAY_MS = 140;

interface UseReplayModeOptions {
  typedGameId: Id<"games"> | undefined;
  isMapFullscreen: boolean;
  graphMap: Parameters<typeof useGameHistory>[0]["graphMap"];
  playerMap: Parameters<typeof useGameHistory>[0]["playerMap"];
  myEnginePlayerId: string | undefined;
  playbackIntervalMs: number;
}

export function useReplayMode({
  typedGameId,
  isMapFullscreen,
  graphMap,
  playerMap,
  myEnginePlayerId,
  playbackIntervalMs,
}: UseReplayModeOptions) {
  const [replayTimelineEnabled, setReplayTimelineEnabled] = useState(false);
  const [jumpSinceLastTurnPending, setJumpSinceLastTurnPending] = useState(false);
  const missingHistoryFrameLoadTimeoutRef = useRef<number | null>(null);
  const {
    historySummary,
    historyTimeline,
    timelineActions,
    canLoadOlderHistory,
    historyLoadingOlder,
    loadOlderHistory,
    loadHistoryAroundIndex,
  } = useReplayWindows(typedGameId, replayTimelineEnabled);

  const history = useGameHistory({
    historyTimeline,
    timelineActions,
    totalHistoryCount: (historySummary?.latestActionIndex ?? -1) + 2,
    graphMap,
    playerMap,
    myEnginePlayerId,
    playbackIntervalMs,
  });

  const {
    historyOpen,
    setHistoryOpen,
    setHistoryPlaying,
    historyFrameIndex,
    setHistoryFrameIndex,
    activeHistoryFrameLoaded,
    lastTurnEndIndex,
    lastTurnEndLoaded,
  } = history;

  const closeReplayMode = useCallback(() => {
    setHistoryOpen(false);
    setReplayTimelineEnabled(false);
    setHistoryPlaying(false);
    setJumpSinceLastTurnPending(false);
  }, [setHistoryOpen, setHistoryPlaying]);

  const toggleReplayMode = useCallback(() => {
    if (isMapFullscreen) return;
    setHistoryOpen((prev) => {
      const next = !prev;
      setReplayTimelineEnabled(next);
      if (!next) {
        setJumpSinceLastTurnPending(false);
      }
      return next;
    });
    setHistoryPlaying(false);
  }, [isMapFullscreen, setHistoryOpen, setHistoryPlaying]);

  const jumpSinceLastTurn = useCallback(() => {
    setHistoryPlaying(false);
    if (lastTurnEndLoaded || !canLoadOlderHistory) {
      setJumpSinceLastTurnPending(false);
      setHistoryFrameIndex(lastTurnEndIndex);
      return;
    }
    setJumpSinceLastTurnPending(true);
    if (!historyLoadingOlder) {
      loadOlderHistory();
    }
  }, [
    canLoadOlderHistory,
    historyLoadingOlder,
    lastTurnEndIndex,
    lastTurnEndLoaded,
    loadOlderHistory,
    setHistoryFrameIndex,
    setHistoryPlaying,
  ]);

  useEffect(() => {
    if (!jumpSinceLastTurnPending) return;
    if (lastTurnEndLoaded || !canLoadOlderHistory) {
      setJumpSinceLastTurnPending(false);
      setHistoryFrameIndex(lastTurnEndIndex);
      return;
    }
    if (!historyLoadingOlder) {
      loadOlderHistory();
    }
  }, [
    canLoadOlderHistory,
    historyLoadingOlder,
    jumpSinceLastTurnPending,
    lastTurnEndIndex,
    lastTurnEndLoaded,
    loadOlderHistory,
    setHistoryFrameIndex,
  ]);

  useEffect(() => {
    if (!isMapFullscreen || !historyOpen) return;
    closeReplayMode();
  }, [closeReplayMode, historyOpen, isMapFullscreen]);

  useEffect(() => {
    if (missingHistoryFrameLoadTimeoutRef.current !== null) {
      window.clearTimeout(missingHistoryFrameLoadTimeoutRef.current);
      missingHistoryFrameLoadTimeoutRef.current = null;
    }
    if (!historyOpen || activeHistoryFrameLoaded) return;
    missingHistoryFrameLoadTimeoutRef.current = window.setTimeout(() => {
      loadHistoryAroundIndex(historyFrameIndex);
      missingHistoryFrameLoadTimeoutRef.current = null;
    }, MISSING_HISTORY_FRAME_LOAD_DELAY_MS);
  }, [activeHistoryFrameLoaded, historyFrameIndex, historyOpen, loadHistoryAroundIndex]);

  useEffect(() => {
    return () => {
      if (missingHistoryFrameLoadTimeoutRef.current !== null) {
        window.clearTimeout(missingHistoryFrameLoadTimeoutRef.current);
      }
    };
  }, []);

  return {
    ...history,
    historySummary,
    timelineActions,
    replayTimelineEnabled,
    toggleReplayMode,
    closeReplayMode,
    jumpSinceLastTurn,
  };
}
