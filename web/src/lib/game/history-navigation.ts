import type { HistoryFrame } from "@/lib/game/types";

function clampIndex(index: number, maxIndex: number) {
  return Math.max(0, Math.min(maxIndex, index));
}

function turnRound(frame: HistoryFrame) {
  return frame.state.turn.round;
}

function turnPlayerId(frame: HistoryFrame) {
  return frame.state.turn.currentPlayerId;
}

function hasEvent(frame: HistoryFrame, type: string) {
  return frame.events?.some((event) => event.type === type) ?? false;
}

export function findPreviousTurnBoundary(frames: HistoryFrame[], currentIndex: number) {
  const safeIndex = clampIndex(currentIndex, Math.max(0, frames.length - 1));
  for (let i = safeIndex; i >= 0; i -= 1) {
    const current = frames[i];
    const previous = frames[i - 1];
    if (!current) continue;
    if (!previous) return i;
    if (turnRound(current) !== turnRound(previous) || turnPlayerId(current) !== turnPlayerId(previous)) {
      return i;
    }
  }
  return 0;
}

export function findNextTurnBoundary(frames: HistoryFrame[], currentIndex: number) {
  const maxIndex = Math.max(0, frames.length - 1);
  const safeIndex = clampIndex(currentIndex, maxIndex);
  for (let i = safeIndex + 1; i < frames.length; i += 1) {
    const current = frames[i];
    const previous = frames[i - 1];
    if (!current || !previous) continue;
    if (turnRound(current) !== turnRound(previous) || turnPlayerId(current) !== turnPlayerId(previous)) {
      return i;
    }
  }
  return maxIndex;
}

export function findNextCaptureFrame(frames: HistoryFrame[], currentIndex: number) {
  const maxIndex = Math.max(0, frames.length - 1);
  const safeIndex = clampIndex(currentIndex, maxIndex);
  for (let i = safeIndex + 1; i < frames.length; i += 1) {
    const frame = frames[i];
    if (frame && hasEvent(frame, "TerritoryCaptured")) return i;
  }
  return safeIndex;
}

export function findNextEliminationFrame(frames: HistoryFrame[], currentIndex: number) {
  const maxIndex = Math.max(0, frames.length - 1);
  const safeIndex = clampIndex(currentIndex, maxIndex);
  for (let i = safeIndex + 1; i < frames.length; i += 1) {
    const frame = frames[i];
    if (frame && hasEvent(frame, "PlayerEliminated")) return i;
  }
  return safeIndex;
}

export function findLastTurnEndForPlayer(frames: HistoryFrame[], playerId: string | null | undefined) {
  return resolveLastTurnEndForPlayer(frames, playerId).frameIndex;
}

export function resolveLastTurnEndForPlayer(frames: HistoryFrame[], playerId: string | null | undefined) {
  if (!playerId || frames.length === 0) return { frameIndex: 0, found: false };

  const maxIndex = Math.max(0, frames.length - 1);
  const hasPlayerFrame = frames.some((frame) => turnPlayerId(frame) === playerId);
  if (!hasPlayerFrame) return { frameIndex: 0, found: false };

  const hasOtherPlayer = frames.some((frame) => turnPlayerId(frame) !== playerId);
  if (!hasOtherPlayer) return { frameIndex: maxIndex, found: true };

  for (let i = maxIndex; i >= 1; i -= 1) {
    const current = frames[i];
    const previous = frames[i - 1];
    if (!current || !previous) continue;
    if (turnPlayerId(previous) === playerId && turnPlayerId(current) !== playerId) {
      return { frameIndex: i, found: true };
    }
  }

  return { frameIndex: 0, found: false };
}
