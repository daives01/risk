import type { HistoryFrame } from "@/lib/game/types";

function clampIndex(index: number, maxIndex: number) {
  return Math.max(0, Math.min(maxIndex, index));
}

export function findPreviousTurnBoundary(frames: HistoryFrame[], currentIndex: number) {
  const safeIndex = clampIndex(currentIndex, Math.max(0, frames.length - 1));
  for (let i = safeIndex; i >= 0; i -= 1) {
    const current = frames[i];
    const previous = frames[i - 1];
    if (!current) continue;
    if (!previous) return i;
    if (current.turnRound !== previous.turnRound || current.turnPlayerId !== previous.turnPlayerId) {
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
    if (current.turnRound !== previous.turnRound || current.turnPlayerId !== previous.turnPlayerId) {
      return i;
    }
  }
  return maxIndex;
}

export function findNextCaptureFrame(frames: HistoryFrame[], currentIndex: number) {
  const maxIndex = Math.max(0, frames.length - 1);
  const safeIndex = clampIndex(currentIndex, maxIndex);
  for (let i = safeIndex + 1; i < frames.length; i += 1) {
    if (frames[i]?.hasCapture) return i;
  }
  return safeIndex;
}

export function findNextEliminationFrame(frames: HistoryFrame[], currentIndex: number) {
  const maxIndex = Math.max(0, frames.length - 1);
  const safeIndex = clampIndex(currentIndex, maxIndex);
  for (let i = safeIndex + 1; i < frames.length; i += 1) {
    if ((frames[i]?.eliminatedPlayerIds.length ?? 0) > 0) return i;
  }
  return safeIndex;
}

export function findLastTurnEndForPlayer(frames: HistoryFrame[], playerId: string | null | undefined) {
  if (!playerId || frames.length === 0) return 0;

  const maxIndex = Math.max(0, frames.length - 1);
  const hasPlayerFrame = frames.some((frame) => frame.turnPlayerId === playerId);
  if (!hasPlayerFrame) return 0;

  const hasOtherPlayer = frames.some((frame) => frame.turnPlayerId !== playerId);
  if (!hasOtherPlayer) return maxIndex;

  for (let i = maxIndex; i >= 1; i -= 1) {
    const current = frames[i];
    const previous = frames[i - 1];
    if (!current || !previous) continue;
    if (previous.turnPlayerId === playerId && current.turnPlayerId !== playerId) {
      return i;
    }
  }

  return 0;
}
