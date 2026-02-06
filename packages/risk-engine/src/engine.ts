import type {
  Action,
  GameEvent,
  GameState,
  PlayerId,
  PlaceReinforcements,
  ReinforcementsPlaced,
} from "./types.js";

// ── Action result ─────────────────────────────────────────────────────

export interface ActionResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

// ── Validation error ──────────────────────────────────────────────────

export class ActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionError";
  }
}

// ── Action handlers ───────────────────────────────────────────────────

function handlePlaceReinforcements(
  state: GameState,
  playerId: PlayerId,
  action: PlaceReinforcements,
): ActionResult {
  // Phase check
  if (state.turn.phase !== "Reinforcement") {
    throw new ActionError(
      `Cannot place reinforcements: current phase is ${state.turn.phase}, expected Reinforcement`,
    );
  }

  // Current player check
  if (state.turn.currentPlayerId !== playerId) {
    throw new ActionError(
      `Not your turn: current player is ${state.turn.currentPlayerId}`,
    );
  }

  // Territory ownership check
  const territory = state.territories[action.territoryId];
  if (!territory) {
    throw new ActionError(
      `Territory ${action.territoryId} does not exist`,
    );
  }
  if (territory.ownerId !== playerId) {
    throw new ActionError(
      `Territory ${action.territoryId} is not owned by ${playerId}`,
    );
  }

  // Count validation
  if (!Number.isInteger(action.count) || action.count < 1) {
    throw new ActionError(
      `Invalid count: must be a positive integer, got ${action.count}`,
    );
  }

  const remaining = state.reinforcements?.remaining ?? 0;
  if (action.count > remaining) {
    throw new ActionError(
      `Cannot place ${action.count} armies: only ${remaining} remaining`,
    );
  }

  // Apply: add armies to territory
  const newRemaining = remaining - action.count;
  const newTerritories = {
    ...state.territories,
    [action.territoryId]: {
      ...territory,
      armies: territory.armies + action.count,
    },
  };

  // Transition to Attack phase when all reinforcements placed
  const newPhase = newRemaining === 0 ? "Attack" as const : "Reinforcement" as const;

  const newState: GameState = {
    ...state,
    territories: newTerritories,
    reinforcements: newRemaining === 0
      ? undefined
      : { ...state.reinforcements!, remaining: newRemaining },
    turn: newPhase !== state.turn.phase
      ? { ...state.turn, phase: newPhase }
      : state.turn,
    stateVersion: state.stateVersion + 1,
  };

  const event: ReinforcementsPlaced = {
    type: "ReinforcementsPlaced",
    playerId,
    territoryId: action.territoryId,
    count: action.count,
  };

  return { state: newState, events: [event] };
}

// ── Dispatcher ────────────────────────────────────────────────────────

export function applyAction(
  state: GameState,
  playerId: PlayerId,
  action: Action,
): ActionResult {
  switch (action.type) {
    case "PlaceReinforcements":
      return handlePlaceReinforcements(state, playerId, action);
    case "TradeCards":
    case "Attack":
    case "Occupy":
    case "Fortify":
    case "EndAttackPhase":
    case "EndTurn":
      throw new ActionError(`Action ${action.type} is not yet implemented`);
  }
}
