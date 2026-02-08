import type { GameState } from "risk-engine";

export const GAME_TIMING_MODES = ["realtime", "async_1d", "async_3d"] as const;

export type GameTimingMode = (typeof GAME_TIMING_MODES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export function isAsyncTimingMode(mode: GameTimingMode): boolean {
  return mode !== "realtime";
}

export function getTurnDurationMs(mode: GameTimingMode): number | null {
  switch (mode) {
    case "realtime":
      return null;
    case "async_1d":
      return DAY_MS;
    case "async_3d":
      return 3 * DAY_MS;
  }
}

function isWeekendUtc(timestamp: number): boolean {
  const day = new Date(timestamp).getUTCDay();
  return day === 0 || day === 6;
}

function weekendEndUtc(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getUTCDay();
  const startOfDayUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  if (day === 6) {
    // Saturday -> Monday 00:00 UTC
    return startOfDayUtc + 2 * DAY_MS;
  }
  if (day === 0) {
    // Sunday -> Monday 00:00 UTC
    return startOfDayUtc + DAY_MS;
  }
  return timestamp;
}

function nextWeekendStartUtc(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getUTCDay();
  const startOfDayUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0,
  );
  const daysUntilSaturday = (6 - day + 7) % 7;
  return startOfDayUtc + daysUntilSaturday * DAY_MS;
}

function addDurationSkippingWeekendsUtc(startAt: number, durationMs: number): number {
  let cursor = startAt;
  let remaining = durationMs;

  while (remaining > 0) {
    if (isWeekendUtc(cursor)) {
      cursor = weekendEndUtc(cursor);
      continue;
    }

    const weekendStart = nextWeekendStartUtc(cursor);
    const availableBeforeWeekend = Math.max(0, weekendStart - cursor);
    const slice = Math.min(remaining, availableBeforeWeekend);
    cursor += slice;
    remaining -= slice;

    if (remaining > 0 && isWeekendUtc(cursor)) {
      cursor = weekendEndUtc(cursor);
    }
  }

  return cursor;
}

export function computeTurnDeadlineAt(
  turnStartedAt: number,
  mode: GameTimingMode,
  excludeWeekends: boolean,
): number | null {
  const durationMs = getTurnDurationMs(mode);
  if (durationMs === null) return null;
  if (!excludeWeekends) return turnStartedAt + durationMs;
  return addDurationSkippingWeekendsUtc(turnStartedAt, durationMs);
}

export function didTurnAdvance(previous: GameState, next: GameState): boolean {
  return previous.turn.currentPlayerId !== next.turn.currentPlayerId;
}
