import type { HistoryFrame, HistoryWindow, PublicState, TimelineStatePatch } from "@/lib/game/types";

const VISIBLE_REPLAY_EVENT_TYPES = new Set([
  "AttackResolved",
  "CardsTraded",
  "FortifyResolved",
  "GameEnded",
  "OccupyResolved",
  "PlayerEliminated",
  "ReinforcementsPlaced",
  "TerritoryCaptured",
  "TurnAdvanced",
  "TurnTimedOut",
]);

export function applyTimelineStatePatch(previous: PublicState, patch: TimelineStatePatch): PublicState {
  const territories = { ...previous.territories };
  for (const [territoryId, changes] of Object.entries(patch.territories ?? {})) {
    const current = territories[territoryId] ?? { ownerId: "neutral", armies: 0 };
    territories[territoryId] = {
      ownerId: changes.ownerId ?? current.ownerId,
      armies: changes.armies ?? current.armies,
    };
  }

  const next: PublicState = {
    ...previous,
    ...(patch.players ? { players: patch.players } : {}),
    ...(patch.turnOrder ? { turnOrder: patch.turnOrder } : {}),
    territories,
    ...(patch.turn ? { turn: patch.turn } : {}),
    ...(patch.capturedThisTurn !== undefined ? { capturedThisTurn: patch.capturedThisTurn } : {}),
    ...(patch.tradesCompleted !== undefined ? { tradesCompleted: patch.tradesCompleted } : {}),
    ...(patch.deckCount !== undefined ? { deckCount: patch.deckCount } : {}),
    ...(patch.discardCount !== undefined ? { discardCount: patch.discardCount } : {}),
    ...(patch.handSizes ? { handSizes: patch.handSizes } : {}),
    ...(patch.stateVersion !== undefined ? { stateVersion: patch.stateVersion } : {}),
  };

  if ("pending" in patch) {
    if (patch.pending === null) delete next.pending;
    else next.pending = patch.pending;
  }
  if ("reinforcements" in patch) {
    if (patch.reinforcements === null) delete next.reinforcements;
    else next.reinforcements = patch.reinforcements;
  }
  if ("fortifiesUsedThisTurn" in patch) {
    if (patch.fortifiesUsedThisTurn === null) delete next.fortifiesUsedThisTurn;
    else next.fortifiesUsedThisTurn = patch.fortifiesUsedThisTurn;
  }

  return next;
}

function hasBoardPatch(patch: TimelineStatePatch) {
  return Object.keys(patch.territories ?? {}).length > 0;
}

function hasVisibleReplayEvent(events: Array<{ type: string; [key: string]: unknown }>) {
  return events.some((event) => VISIBLE_REPLAY_EVENT_TYPES.has(event.type));
}

export function isVisibleReplayAction(action: HistoryWindow["actions"][number]) {
  if (hasVisibleReplayEvent(action.events)) return true;
  if (!action.publicStatePatch) return false;
  return hasBoardPatch(action.publicStatePatch);
}

export function reconstructHistoryWindow(window: HistoryWindow | null | undefined): HistoryFrame[] {
  if (!window?.snapshotPublicState) return [];

  const snapshotIndex = window.snapshotIndex ?? -1;
  const frames: HistoryFrame[] = snapshotIndex <= -1
    ? [{
      index: snapshotIndex,
      events: [],
      state: window.snapshotPublicState,
    }]
    : [];
  let state: PublicState = window.snapshotPublicState;

  for (const action of window.actions) {
    if (!action.publicStatePatch) continue;
    state = applyTimelineStatePatch(state, action.publicStatePatch);
    if (!isVisibleReplayAction(action)) continue;
    frames.push({
      index: action.index,
      events: action.events,
      state,
    });
  }

  return frames;
}

export function reconstructHistoryWindows(windows: Array<HistoryWindow | null | undefined>): HistoryFrame[] {
  const framesByIndex = new Map<number, HistoryFrame>();

  for (const window of windows) {
    for (const frame of reconstructHistoryWindow(window)) {
      framesByIndex.set(frame.index, frame);
    }
  }

  return Array.from(framesByIndex.values()).sort((left, right) => left.index - right.index);
}

export function mergeHistoryWindowActions(windows: Array<HistoryWindow | null | undefined>) {
  const actionsByIndex = new Map<number, HistoryWindow["actions"][number]>();

  for (const window of windows) {
    for (const action of window?.actions ?? []) {
      if (!isVisibleReplayAction(action)) continue;
      actionsByIndex.set(action.index, action);
    }
  }

  return Array.from(actionsByIndex.values()).sort((left, right) => left.index - right.index);
}
