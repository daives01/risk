import type { HistoryFrame, HistoryTimelineEntry, HistoryWindow, PublicState, TimelineStatePatch } from "@/lib/game/types";

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

export function reconstructHistoryFrames(entries: HistoryTimelineEntry[] | null | undefined): HistoryFrame[] {
  if (!entries?.length) return [];

  const frames: HistoryFrame[] = [];
  let state: PublicState | null = null;

  for (const entry of entries) {
    if (entry.checkpointState) {
      state = entry.checkpointState;
    } else if (entry.statePatch && state) {
      state = applyTimelineStatePatch(state, entry.statePatch);
    } else {
      state = null;
      continue;
    }

    frames.push({
      index: entry.index,
      events: entry.events,
      state,
    });
  }

  return frames;
}

export function reconstructHistoryWindow(window: HistoryWindow | null | undefined): HistoryFrame[] {
  if (!window?.snapshotPublicState) return [];

  const frames: HistoryFrame[] = [{
    index: window.snapshotIndex ?? -1,
    events: [],
    state: window.snapshotPublicState,
  }];
  let state: PublicState = window.snapshotPublicState;

  for (const action of window.actions) {
    if (!action.publicStatePatch) continue;
    state = applyTimelineStatePatch(state, action.publicStatePatch);
    frames.push({
      index: action.index,
      events: action.events,
      state,
    });
  }

  return frames;
}
