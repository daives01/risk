export type ReplayFrameCommand = "previous-frame" | "next-frame" | "reset-to-latest";

export interface ReplayFrameCommandState {
  frameIndex: number;
  historyMaxIndex: number;
}

export function resolveReplayFrameCommand(
  command: ReplayFrameCommand,
  { frameIndex, historyMaxIndex }: ReplayFrameCommandState,
) {
  if (command === "previous-frame") return Math.max(0, frameIndex - 1);
  if (command === "next-frame") return Math.min(historyMaxIndex, frameIndex + 1);
  return historyMaxIndex;
}

export interface SinceLastTurnStepOptions {
  canLoadOlderHistory: boolean;
  historyLoadingOlder: boolean;
  lastTurnEndIndex: number;
  lastTurnEndLoaded: boolean;
}

export function resolveSinceLastTurnStep({
  canLoadOlderHistory,
  historyLoadingOlder,
  lastTurnEndIndex,
  lastTurnEndLoaded,
}: SinceLastTurnStepOptions) {
  if (lastTurnEndLoaded || !canLoadOlderHistory) {
    return {
      frameIndex: lastTurnEndIndex,
      pending: false,
      shouldLoadOlderHistory: false,
    };
  }

  return {
    frameIndex: null,
    pending: true,
    shouldLoadOlderHistory: !historyLoadingOlder,
  };
}

export function shouldRequestMissingHistoryFrame({
  historyOpen,
  activeHistoryFrameLoaded,
}: {
  historyOpen: boolean;
  activeHistoryFrameLoaded: boolean;
}) {
  return historyOpen && !activeHistoryFrameLoaded;
}
