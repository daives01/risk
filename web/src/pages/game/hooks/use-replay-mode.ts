/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Id } from "@backend/_generated/dataModel";
import { useReplayWindows } from "@/lib/game/use-replay-windows";
import { useGameHistory } from "@/pages/game/hooks/use-game-history";
import {
  resolveReplayFrameCommand,
  resolveSinceLastTurnStep,
  shouldRequestMissingHistoryFrame,
} from "@/pages/game/hooks/replay-mode-policy";

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
  const [pendingPreviousFrameIndex, setPendingPreviousFrameIndex] = useState<number | null>(null);
  const [pendingScrubFrame, setPendingScrubFrame] = useState<{
    frameIndex: number;
    direction: "previous" | "next" | "nearest";
  } | null>(null);
  const missingHistoryFrameLoadTimeoutRef = useRef<number | null>(null);
  const {
    historySummary,
    historyTimeline,
    timelineActions,
    canLoadOlderHistory,
    historyLoadingOlder,
    historyLoadingTarget,
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
    historyMaxIndex,
    activeHistoryFrameLoaded,
    lastTurnEndIndex,
    lastTurnEndLoaded,
  } = history;

  const visibleFramePositions = useMemo(
    () => history.historyFrames.map((frame) => frame.index + 1),
    [history.historyFrames],
  );
  const resolvePreviousVisibleFramePosition = useCallback((frameIndex: number) => {
    return [...visibleFramePositions].reverse().find((position) => position < frameIndex) ?? null;
  }, [visibleFramePositions]);
  const resolveVisibleFramePosition = useCallback((
    frameIndex: number,
    direction: "previous" | "next" | "nearest" = "nearest",
  ) => {
    if (visibleFramePositions.length === 0) return frameIndex;
    if (visibleFramePositions.includes(frameIndex)) return frameIndex;
    const previous = resolvePreviousVisibleFramePosition(frameIndex) ?? undefined;
    const next = visibleFramePositions.find((position) => position > frameIndex);
    if (direction === "previous") return previous ?? next ?? frameIndex;
    if (direction === "next") return next ?? previous ?? frameIndex;
    if (previous === undefined) return next ?? frameIndex;
    if (next === undefined) return previous;
    return frameIndex - previous <= next - frameIndex ? previous : next;
  }, [resolvePreviousVisibleFramePosition, visibleFramePositions]);

  const closeReplayMode = useCallback(() => {
    setHistoryOpen(false);
    setReplayTimelineEnabled(false);
    setHistoryPlaying(false);
    setJumpSinceLastTurnPending(false);
    setPendingPreviousFrameIndex(null);
    setPendingScrubFrame(null);
  }, [setHistoryOpen, setHistoryPlaying]);

  const toggleReplayMode = useCallback(() => {
    if (isMapFullscreen) return;
    setHistoryOpen((prev) => {
      const next = !prev;
      setReplayTimelineEnabled(next);
      if (!next) {
        setJumpSinceLastTurnPending(false);
        setPendingPreviousFrameIndex(null);
        setPendingScrubFrame(null);
      }
      return next;
    });
    setHistoryPlaying(false);
  }, [isMapFullscreen, setHistoryOpen, setHistoryPlaying]);

  const scrubToFrame = useCallback((frameIndex: number) => {
    const targetFrameIndex = Math.max(0, Math.min(historyMaxIndex, Math.floor(frameIndex)));
    const direction = targetFrameIndex < historyFrameIndex
      ? "previous"
      : targetFrameIndex > historyFrameIndex
        ? "next"
        : "nearest";
    if (!visibleFramePositions.includes(targetFrameIndex)) {
      setPendingScrubFrame({ frameIndex: targetFrameIndex, direction });
      loadHistoryAroundIndex(targetFrameIndex);
    } else {
      setPendingScrubFrame(null);
    }
    setHistoryFrameIndex(targetFrameIndex);
    setHistoryPlaying(false);
  }, [
    historyFrameIndex,
    historyMaxIndex,
    loadHistoryAroundIndex,
    setHistoryFrameIndex,
    setHistoryPlaying,
    visibleFramePositions,
  ]);

  const moveToPreviousFrame = useCallback(() => {
    const previousFrameIndex = resolveReplayFrameCommand("previous-frame", { frameIndex: historyFrameIndex, historyMaxIndex });
    const previousVisibleFrameIndex = resolvePreviousVisibleFramePosition(historyFrameIndex);
    if (previousVisibleFrameIndex !== null) {
      setHistoryFrameIndex(previousVisibleFrameIndex);
    } else {
      if (canLoadOlderHistory && !historyLoadingOlder) {
        setPendingPreviousFrameIndex(historyFrameIndex);
        loadOlderHistory();
      }
      setHistoryFrameIndex(resolveVisibleFramePosition(previousFrameIndex, "previous"));
    }
    setHistoryPlaying(false);
  }, [
    canLoadOlderHistory,
    historyFrameIndex,
    historyLoadingOlder,
    historyMaxIndex,
    loadOlderHistory,
    resolvePreviousVisibleFramePosition,
    resolveVisibleFramePosition,
    setHistoryFrameIndex,
    setHistoryPlaying,
  ]);

  const moveToNextFrame = useCallback(() => {
    setHistoryFrameIndex((frameIndex) =>
      resolveVisibleFramePosition(
        resolveReplayFrameCommand("next-frame", { frameIndex, historyMaxIndex }),
        "next",
      )
    );
    setHistoryPlaying(false);
  }, [historyMaxIndex, resolveVisibleFramePosition, setHistoryFrameIndex, setHistoryPlaying]);

  const resetToLatestFrame = useCallback(() => {
    setHistoryFrameIndex((frameIndex) =>
      resolveVisibleFramePosition(
        resolveReplayFrameCommand("reset-to-latest", { frameIndex, historyMaxIndex }),
        "previous",
      )
    );
    setHistoryPlaying(false);
  }, [historyMaxIndex, resolveVisibleFramePosition, setHistoryFrameIndex, setHistoryPlaying]);

  const togglePlayback = useCallback(() => {
    setHistoryPlaying((playing) => !playing);
  }, [setHistoryPlaying]);

  const jumpSinceLastTurn = useCallback(() => {
    setHistoryPlaying(false);
    const next = resolveSinceLastTurnStep({
      canLoadOlderHistory,
      historyLoadingOlder,
      lastTurnEndIndex,
      lastTurnEndLoaded,
    });
    setJumpSinceLastTurnPending(next.pending);
    if (next.frameIndex !== null) {
      setHistoryFrameIndex(next.frameIndex);
    }
    if (next.shouldLoadOlderHistory) {
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
    const next = resolveSinceLastTurnStep({
      canLoadOlderHistory,
      historyLoadingOlder,
      lastTurnEndIndex,
      lastTurnEndLoaded,
    });
    setJumpSinceLastTurnPending(next.pending);
    if (next.frameIndex !== null) {
      setHistoryFrameIndex(next.frameIndex);
    }
    if (next.shouldLoadOlderHistory) {
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
    if (pendingPreviousFrameIndex === null) return;
    const previousVisibleFrameIndex = resolvePreviousVisibleFramePosition(pendingPreviousFrameIndex);
    if (previousVisibleFrameIndex !== null) {
      setPendingPreviousFrameIndex(null);
      setHistoryFrameIndex(previousVisibleFrameIndex);
      return;
    }
    if (!canLoadOlderHistory && !historyLoadingOlder) {
      setPendingPreviousFrameIndex(null);
    }
  }, [
    canLoadOlderHistory,
    historyLoadingOlder,
    pendingPreviousFrameIndex,
    resolvePreviousVisibleFramePosition,
    setHistoryFrameIndex,
  ]);

  useEffect(() => {
    if (!pendingScrubFrame) return;
    if (!activeHistoryFrameLoaded && (historyLoadingOlder || historyLoadingTarget)) return;

    const resolvedFrameIndex = resolveVisibleFramePosition(
      pendingScrubFrame.frameIndex,
      pendingScrubFrame.direction,
    );
    if (resolvedFrameIndex === pendingScrubFrame.frameIndex && !activeHistoryFrameLoaded) return;

    setPendingScrubFrame(null);
    setHistoryFrameIndex(resolvedFrameIndex);
  }, [
    activeHistoryFrameLoaded,
    historyLoadingOlder,
    historyLoadingTarget,
    pendingScrubFrame,
    resolveVisibleFramePosition,
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
    if (!shouldRequestMissingHistoryFrame({ historyOpen, activeHistoryFrameLoaded })) return;
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
    activeHistoryFrame: history.activeHistoryFrame,
    activeHistoryFrameLabel: history.activeHistoryFrameLabel,
    historyAtEnd: history.historyAtEnd,
    historyAttackEdgeIds: history.historyAttackEdgeIds,
    historyCount: history.historyCount,
    historyFrameIndex: history.historyFrameIndex,
    historyMaxIndex: history.historyMaxIndex,
    historyOpen: history.historyOpen,
    historyPlaying: history.historyPlaying,
    historySummary,
    replayTimelineEnabled,
    timelineActions,
    replayCommands: {
      closeReplayMode,
      jumpSinceLastTurn,
      moveToNextFrame,
      moveToPreviousFrame,
      resetToLatestFrame,
      scrubToFrame,
      togglePlayback,
      toggleReplayMode,
    },
  };
}
