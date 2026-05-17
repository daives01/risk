import type { GameEvent, GameState } from "risk-engine";

export type TimelinePublicState = {
  players: Record<string, { status: string; teamId?: string }>;
  turnOrder: string[];
  territories: Record<string, { ownerId: string; armies: number }>;
  turn: { currentPlayerId: string; phase: string; round: number };
  pending?: {
    type: "Occupy";
    from: string;
    to: string;
    minMove: number;
    maxMove: number;
  };
  reinforcements?: { remaining: number; sources?: Record<string, number> };
  capturedThisTurn: boolean;
  tradesCompleted: number;
  fortifiesUsedThisTurn?: number;
  deckCount: number;
  discardCount: number;
  handSizes: Record<string, number>;
  stateVersion: number;
};

export type TimelineStatePatch = {
  players?: TimelinePublicState["players"];
  turnOrder?: TimelinePublicState["turnOrder"];
  territories?: Record<string, { ownerId?: string; armies?: number }>;
  turn?: TimelinePublicState["turn"];
  pending?: TimelinePublicState["pending"] | null;
  reinforcements?: TimelinePublicState["reinforcements"] | null;
  capturedThisTurn?: boolean;
  tradesCompleted?: number;
  fortifiesUsedThisTurn?: number | null;
  deckCount?: number;
  discardCount?: number;
  handSizes?: TimelinePublicState["handSizes"];
  stateVersion?: number;
};

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildTimelineStatePatch(
  previous: TimelinePublicState | null,
  next: TimelinePublicState,
): TimelineStatePatch {
  if (!previous) return next;

  const patch: TimelineStatePatch = {};
  if (!sameJson(previous.players, next.players)) patch.players = next.players;
  if (!sameJson(previous.turnOrder, next.turnOrder)) patch.turnOrder = next.turnOrder;

  const territoryPatch: NonNullable<TimelineStatePatch["territories"]> = {};
  const territoryIds = new Set([...Object.keys(previous.territories), ...Object.keys(next.territories)]);
  for (const territoryId of territoryIds) {
    const before = previous.territories[territoryId];
    const after = next.territories[territoryId];
    if (!after) continue;
    const entry: { ownerId?: string; armies?: number } = {};
    if (!before || before.ownerId !== after.ownerId) entry.ownerId = after.ownerId;
    if (!before || before.armies !== after.armies) entry.armies = after.armies;
    if (Object.keys(entry).length > 0) territoryPatch[territoryId] = entry;
  }
  if (Object.keys(territoryPatch).length > 0) patch.territories = territoryPatch;

  if (!sameJson(previous.turn, next.turn)) patch.turn = next.turn;
  if (!sameJson(previous.pending, next.pending)) patch.pending = next.pending ?? null;
  if (!sameJson(previous.reinforcements, next.reinforcements)) patch.reinforcements = next.reinforcements ?? null;
  if (previous.capturedThisTurn !== next.capturedThisTurn) patch.capturedThisTurn = next.capturedThisTurn;
  if (previous.tradesCompleted !== next.tradesCompleted) patch.tradesCompleted = next.tradesCompleted;
  if (previous.fortifiesUsedThisTurn !== next.fortifiesUsedThisTurn) {
    patch.fortifiesUsedThisTurn = next.fortifiesUsedThisTurn ?? null;
  }
  if (previous.deckCount !== next.deckCount) patch.deckCount = next.deckCount;
  if (previous.discardCount !== next.discardCount) patch.discardCount = next.discardCount;
  if (!sameJson(previous.handSizes, next.handSizes)) patch.handSizes = next.handSizes;
  if (previous.stateVersion !== next.stateVersion) patch.stateVersion = next.stateVersion;

  return patch;
}

export function applyTimelineStatePatch(
  previous: TimelinePublicState,
  patch: TimelineStatePatch,
): TimelinePublicState {
  const territories = { ...previous.territories };
  for (const [territoryId, changes] of Object.entries(patch.territories ?? {})) {
    const current = territories[territoryId] ?? { ownerId: "neutral", armies: 0 };
    territories[territoryId] = {
      ownerId: changes.ownerId ?? current.ownerId,
      armies: changes.armies ?? current.armies,
    };
  }

  const next: TimelinePublicState = {
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

export function describeTimelineStep(action: Record<string, unknown>, events: GameEvent[]) {
  const firstEvent = events[0];
  if (firstEvent?.type === "ReinforcementsPlaced") return "Placed armies";
  if (firstEvent?.type === "AttackResolved") return "Attack resolved";
  if (firstEvent?.type === "TerritoryCaptured") return "Territory captured";
  if (firstEvent?.type === "OccupyResolved") return "Occupy move";
  if (firstEvent?.type === "FortifyResolved") return "Fortified";
  if (firstEvent?.type === "TurnAdvanced") return "Turn advanced";
  if (firstEvent?.type === "GameEnded") return "Game ended";

  const actionType = typeof action.type === "string" ? action.type : "Action";
  if (actionType === "PlaceReinforcementsBatch") return "Placement batch confirmed";
  return actionType;
}

export function summarizeTimelineFrame(args: {
  action: Record<string, unknown>;
  actionType: string;
  actorId: string | null;
  events: GameEvent[];
  state: GameState;
}) {
  const { action, actionType, actorId, events, state } = args;
  const eliminatedPlayerIds: string[] = [];
  for (const event of events) {
    if (event.type === "PlayerEliminated" && "eliminatedId" in event && typeof event.eliminatedId === "string") {
      eliminatedPlayerIds.push(event.eliminatedId);
    }
  }
  const hasCapture = events.some((event) => event.type === "TerritoryCaptured");
  const turnRound = state.turn.round;
  const turnPlayerId = state.turn.currentPlayerId;
  const turnPhase = state.turn.phase;
  const actorLabel = actorId ?? "system";

  return {
    actorId,
    hasCapture,
    eliminatedPlayerIds,
    turnRound,
    turnPlayerId,
    turnPhase,
    label: `R${turnRound} ${actorLabel} ${actionType}: ${describeTimelineStep(action, events)}`,
  };
}
