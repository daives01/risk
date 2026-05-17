/* eslint-disable react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization */
import { useEffect, useMemo, useRef, useState } from "react";
import { formatEvent } from "@/lib/game/display";
import { resolveLastTurnEndForPlayer } from "@/lib/game/history-navigation";
import type { GameAction, HistoryFrame } from "@/lib/game/types";

interface BuildHistoryEventsOptions {
  timelineActions: GameAction[] | null | undefined;
  graphMap:
    | {
      territories: Record<string, { name?: string }>;
      adjacency: Record<string, readonly string[]>;
    }
    | null
    | undefined;
  playerMap: Array<{ displayName: string; enginePlayerId: string | null }>;
}

export function clampHistoryFrameIndex(currentIndex: number, historyCount: number): number {
  const maxIndex = Math.max(0, historyCount - 1);
  return Math.min(currentIndex, maxIndex);
}

export function buildHistoryFrameLabel({
  action,
  graphMap,
  playerMap,
}: {
  action: GameAction | null | undefined;
  graphMap: BuildHistoryEventsOptions["graphMap"];
  playerMap: BuildHistoryEventsOptions["playerMap"];
}) {
  if (!action) return "Start of game";
  const events = buildHistoryEvents({ timelineActions: [action], graphMap, playerMap });
  return events.at(-1)?.text ?? `Action ${action.index}`;
}

export function buildHistoryEvents({ timelineActions, graphMap, playerMap }: BuildHistoryEventsOptions) {
  if (!timelineActions?.length) return [];
  const events: Array<{ key: string; text: string; index: number }> = [];
  const ignoredEventTypes = new Set(["CardDrawn", "TurnEnded", "ReinforcementsGranted"]);
  const territoryLabel = (id: string) => graphMap?.territories[id]?.name ?? id;
  const playerLabel = (id: string | null) =>
    playerMap.find((player) => player.enginePlayerId === id)?.displayName ?? id ?? "Unknown";
  const attackLossLabel = (attackerLosses: number, defenderLosses: number) =>
    `(-${attackerLosses}/-${defenderLosses})`;
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
    const lossLabel = attackLossLabel(attackStreak.attackerLosses, attackStreak.defenderLosses);
    const attackLabel = attackStreak.count > 1
      ? `${attackStreak.fromLabel} attacked ${attackStreak.toLabel} x${attackStreak.count} ${lossLabel}`
      : `${attackStreak.fromLabel} attacked ${attackStreak.toLabel} ${lossLabel}`;
    events.push({ key: attackStreak.key, text: attackLabel, index: attackStreak.index });
    attackStreak = null;
  };

  for (const action of timelineActions) {
    flushAttackStreak();
    let reinforcementSummary: {
      key: string;
      playerId: string | null;
      total: number;
      byTerritory: Map<string, number>;
    } | null = null;

    const flushReinforcements = () => {
      if (!reinforcementSummary) return;
      const entries = Array.from(reinforcementSummary.byTerritory.entries()).map(([id, count]) => {
        return `${territoryLabel(id)} +${count}`;
      });
      const summaryText = entries.length > 1
        ? `${playerLabel(reinforcementSummary.playerId)} placed ${reinforcementSummary.total} armies: ${entries.join(", ")}`
        : `${playerLabel(reinforcementSummary.playerId)} placed ${reinforcementSummary.total} armies on ${entries[0] ?? "Unknown"}`;
      events.push({ key: reinforcementSummary.key, text: summaryText, index: action.index });
      reinforcementSummary = null;
    };

    for (const [eventIndex, event] of action.events.entries()) {
      if (event.type === "ReinforcementsPlaced") {
        const territoryId = typeof event.territoryId === "string" ? event.territoryId : "Unknown";
        const count = Number(event.count ?? 0);
        const playerId = typeof event.playerId === "string" ? event.playerId : null;
        if (!reinforcementSummary) {
          reinforcementSummary = {
            key: `${action._id}-${eventIndex}`,
            playerId,
            total: 0,
            byTerritory: new Map(),
          };
        }
        reinforcementSummary.total += count;
        reinforcementSummary.byTerritory.set(
          territoryId,
          (reinforcementSummary.byTerritory.get(territoryId) ?? 0) + count,
        );
        if (!reinforcementSummary.playerId && playerId) {
          reinforcementSummary.playerId = playerId;
        }
        continue;
      }

      flushReinforcements();
      if (ignoredEventTypes.has(String(event.type ?? ""))) {
        continue;
      }
      if (event.type === "AttackResolved") {
        const from = String(event.from ?? "");
        const to = String(event.to ?? "");
        const fromLabel = territoryLabel(from);
        const toLabel = territoryLabel(to);
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
        text: formatEvent(event, playerMap, graphMap as Parameters<typeof formatEvent>[2]),
        index: action.index,
      });
    }
    flushReinforcements();
  }

  flushAttackStreak();
  return events.slice(-80).reverse();
}

interface UseGameHistoryOptions {
  historyTimeline: HistoryFrame[] | null | undefined;
  timelineActions: GameAction[] | null | undefined;
  totalHistoryCount?: number;
  graphMap:
    | {
      territories: Record<string, { name?: string }>;
      adjacency: Record<string, readonly string[]>;
    }
    | null
    | undefined;
  playerMap: Array<{ displayName: string; enginePlayerId: string | null }>;
  myEnginePlayerId: string | undefined;
  playbackIntervalMs: number;
}

export function useGameHistory({
  historyTimeline,
  timelineActions,
  totalHistoryCount,
  graphMap,
  playerMap,
  myEnginePlayerId,
  playbackIntervalMs,
}: UseGameHistoryOptions) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPlaying, setHistoryPlaying] = useState(false);
  const [historyFrameIndex, setHistoryFrameIndex] = useState(0);
  const wasHistoryOpenRef = useRef(false);

  const historyFrames = useMemo(() => historyTimeline ?? [], [historyTimeline]);
  const loadedFramesByPosition = useMemo(() => {
    const framesByPosition = new Map<number, HistoryFrame>();
    for (const frame of historyFrames) {
      framesByPosition.set(frame.index + 1, frame);
    }
    return framesByPosition;
  }, [historyFrames]);
  const loadedFramePositions = useMemo(
    () => Array.from(loadedFramesByPosition.keys()).sort((left, right) => left - right),
    [loadedFramesByPosition],
  );
  const historyCount = Math.max(totalHistoryCount ?? historyFrames.length, historyFrames.length);
  const historyMaxIndex = Math.max(0, historyCount - 1);
  const historyAtEnd =
    historyFrameIndex >= historyMaxIndex ||
    !loadedFramePositions.some((position) => position > historyFrameIndex);
  const lastTurnEndTarget = useMemo(() => {
    const loadedTarget = resolveLastTurnEndForPlayer(historyFrames, myEnginePlayerId);
    return {
      index: (historyFrames[loadedTarget.frameIndex]?.index ?? -1) + 1,
      loaded: loadedTarget.found,
    };
  }, [historyFrames, myEnginePlayerId]);

  const historyEvents = useMemo(
    () => buildHistoryEvents({ timelineActions, graphMap, playerMap }),
    [graphMap, playerMap, timelineActions],
  );

  const activeHistoryEventIndex = useMemo(() => {
    if (!historyOpen) return null;
    return historyFrameIndex - 1;
  }, [historyFrameIndex, historyOpen]);

  const activeHistoryFrame = useMemo(() => {
    const exactFrame = loadedFramesByPosition.get(historyFrameIndex);
    if (exactFrame) return exactFrame;

    let nearestFrame: HistoryFrame | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const [position, frame] of loadedFramesByPosition) {
      const distance = Math.abs(position - historyFrameIndex);
      if (distance < nearestDistance) {
        nearestFrame = frame;
        nearestDistance = distance;
      }
    }
    return nearestFrame;
  }, [historyFrameIndex, loadedFramesByPosition]);
  const activeHistoryFrameLoaded = loadedFramesByPosition.has(historyFrameIndex);

  const historyAttackEdgeIds = useMemo(() => {
    if (!timelineActions?.length) return null;
    const frame = loadedFramesByPosition.get(historyFrameIndex);
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
  }, [historyFrameIndex, loadedFramesByPosition, timelineActions]);

  const activeHistoryFrameLabel = useMemo(() => {
    if (!historyOpen) return null;
    if (!activeHistoryFrameLoaded) return "Loading replay frame...";
    const frame = loadedFramesByPosition.get(historyFrameIndex);
    const action = frame ? timelineActions?.find((entry) => entry.index === frame.index) : null;
    return buildHistoryFrameLabel({ action, graphMap, playerMap });
  }, [activeHistoryFrameLoaded, graphMap, historyFrameIndex, historyOpen, loadedFramesByPosition, playerMap, timelineActions]);

  useEffect(() => {
    if (!historyOpen) {
      setHistoryPlaying(false);
      return;
    }
    setHistoryFrameIndex((prev) => clampHistoryFrameIndex(prev, historyCount));
  }, [historyCount, historyOpen]);

  useEffect(() => {
    if (!historyOpen) return;
    if (wasHistoryOpenRef.current) return;
    wasHistoryOpenRef.current = true;
    setHistoryFrameIndex(historyMaxIndex);
  }, [historyMaxIndex, historyOpen]);

  useEffect(() => {
    if (historyOpen) return;
    wasHistoryOpenRef.current = false;
  }, [historyOpen]);

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
        return loadedFramePositions.find((position) => position > prev) ?? prev;
      });
    }, playbackIntervalMs);
    return () => clearInterval(timer);
  }, [historyCount, historyOpen, historyPlaying, loadedFramePositions, playbackIntervalMs]);

  return {
    historyOpen,
    setHistoryOpen,
    historyPlaying,
    setHistoryPlaying,
    historyFrameIndex,
    setHistoryFrameIndex,
    historyFrames,
    activeHistoryFrame,
    activeHistoryFrameLoaded,
    historyEvents,
    historyMaxIndex,
    historyAtEnd,
    historyAttackEdgeIds,
    activeHistoryEventIndex,
    activeHistoryFrameLabel,
    lastTurnEndIndex: lastTurnEndTarget.index,
    lastTurnEndLoaded: lastTurnEndTarget.loaded,
    historyCount,
  };
}
