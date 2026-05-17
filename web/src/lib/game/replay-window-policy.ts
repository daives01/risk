import type { HistoryWindow } from "./types";

export const REPLAY_WINDOW_SIZE = 100;
export const MAX_REPLAY_WINDOWS_IN_MEMORY = 4;

export function trimReplayWindowCache(windowsByKey: Record<string, HistoryWindow>) {
  const entries = Object.entries(windowsByKey);
  if (entries.length <= MAX_REPLAY_WINDOWS_IN_MEMORY) return windowsByKey;

  return Object.fromEntries(entries.slice(-MAX_REPLAY_WINDOWS_IN_MEMORY));
}

export function resolveReplayWindowBeforeIndex(args: {
  framePosition: number;
  latestActionIndex: number | null | undefined;
}) {
  if (!Number.isFinite(args.framePosition)) return null;
  if (typeof args.latestActionIndex !== "number") return null;
  const actionIndex = Math.max(-1, Math.floor(args.framePosition) - 1);
  if (actionIndex < 0) return 0;
  const windowEnd = Math.min(
    args.latestActionIndex,
    Math.floor(actionIndex / REPLAY_WINDOW_SIZE) * REPLAY_WINDOW_SIZE + REPLAY_WINDOW_SIZE - 1,
  );
  return windowEnd + 1;
}
