import type {
  Action,
  AttackAction,
  AttackResolved,
  GameEnded,
  GameEvent,
  GameState,
  OccupyAction,
  OccupyResolved,
  Phase,
  PendingOccupy,
  PlayerEliminated,
  PlayerState,
  PlayerId,
  PlaceReinforcements,
  ReinforcementsPlaced,
  TerritoryCaptured,
  TerritoryId,
} from "./types.js";
import type { GraphMap } from "./map.js";
import type { CombatConfig } from "./config.js";
import { createRng } from "./rng.js";

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

// ── Attack handler ────────────────────────────────────────────────────

function handleAttack(
  state: GameState,
  playerId: PlayerId,
  action: AttackAction,
  map: GraphMap,
  combat: CombatConfig,
): ActionResult {
  // Phase check
  if (state.turn.phase !== "Attack") {
    throw new ActionError(
      `Cannot attack: current phase is ${state.turn.phase}, expected Attack`,
    );
  }

  // Current player check
  if (state.turn.currentPlayerId !== playerId) {
    throw new ActionError(
      `Not your turn: current player is ${state.turn.currentPlayerId}`,
    );
  }

  // No pending occupy
  if (state.pending) {
    throw new ActionError(
      `Cannot attack while an Occupy is pending`,
    );
  }

  // Territory existence
  const fromTerritory = state.territories[action.from];
  if (!fromTerritory) {
    throw new ActionError(`Territory ${action.from} does not exist`);
  }
  const toTerritory = state.territories[action.to];
  if (!toTerritory) {
    throw new ActionError(`Territory ${action.to} does not exist`);
  }

  // Ownership: from must be owned by actor
  if (fromTerritory.ownerId !== playerId) {
    throw new ActionError(
      `Territory ${action.from} is not owned by ${playerId}`,
    );
  }

  // Target must not be owned by actor
  if (toTerritory.ownerId === playerId) {
    throw new ActionError(
      `Cannot attack your own territory ${action.to}`,
    );
  }

  // Adjacency check
  const neighbors = map.adjacency[action.from];
  if (!neighbors || !neighbors.includes(action.to)) {
    throw new ActionError(
      `Territory ${action.from} is not adjacent to ${action.to}`,
    );
  }

  // From must have >= 2 armies
  if (fromTerritory.armies < 2) {
    throw new ActionError(
      `Territory ${action.from} must have at least 2 armies to attack, has ${fromTerritory.armies}`,
    );
  }

  // Determine attacker dice count
  const maxAttackerCanRoll = Math.min(combat.maxAttackDice, fromTerritory.armies - 1);
  let attackerDice: number;
  if (action.attackerDice !== undefined) {
    if (!combat.allowAttackerDiceChoice) {
      throw new ActionError(`Attacker dice choice is not allowed by ruleset`);
    }
    if (!Number.isInteger(action.attackerDice) || action.attackerDice < 1) {
      throw new ActionError(
        `Invalid attacker dice: must be a positive integer, got ${action.attackerDice}`,
      );
    }
    if (action.attackerDice > maxAttackerCanRoll) {
      throw new ActionError(
        `Cannot roll ${action.attackerDice} dice: maximum is ${maxAttackerCanRoll}`,
      );
    }
    attackerDice = action.attackerDice;
  } else {
    attackerDice = maxAttackerCanRoll;
  }

  // Determine defender dice count (auto-defend: always max)
  const defenderDice = Math.min(combat.maxDefendDice, toTerritory.armies);

  // Roll dice using RNG
  const rng = createRng(state.rng);
  const attackRolls = rng.rollDice(attackerDice);
  const defendRolls = rng.rollDice(defenderDice);

  // Compare pairs (both sorted descending), ties go to defender
  const pairs = Math.min(attackRolls.length, defendRolls.length);
  let attackerLosses = 0;
  let defenderLosses = 0;
  for (let i = 0; i < pairs; i++) {
    if (attackRolls[i]! > defendRolls[i]!) {
      defenderLosses++;
    } else {
      attackerLosses++;
    }
  }

  // Apply losses
  const newFromArmies = fromTerritory.armies - attackerLosses;
  const newToArmies = toTerritory.armies - defenderLosses;

  const events: GameEvent[] = [];

  const attackEvent: AttackResolved = {
    type: "AttackResolved",
    from: action.from,
    to: action.to,
    attackDice: attackerDice,
    defendDice: defenderDice,
    attackRolls,
    defendRolls,
    attackerLosses,
    defenderLosses,
  };
  events.push(attackEvent);

  // Build new territories
  let newTerritories = {
    ...state.territories,
    [action.from]: { ...fromTerritory, armies: newFromArmies },
    [action.to]: { ...toTerritory, armies: newToArmies },
  };

  let pending: PendingOccupy | undefined = state.pending;
  let newCapturedThisTurn = state.capturedThisTurn;
  let newPlayers: Record<string, PlayerState> | undefined;
  let newPhase: Phase | undefined;

  // Check if territory captured (defender reaches 0 armies)
  if (newToArmies === 0) {
    // Territory captured: transfer ownership to attacker (0 armies for now, occupy will move)
    newTerritories = {
      ...newTerritories,
      [action.to]: { ownerId: playerId, armies: 0 },
    };

    const captureEvent: TerritoryCaptured = {
      type: "TerritoryCaptured",
      from: action.from,
      to: action.to,
      newOwnerId: playerId,
    };
    events.push(captureEvent);

    // Set pending occupy: must move at least attackerDice armies (the dice used), max is from.armies - 1
    const minMove = attackerDice;
    const maxMove = newFromArmies - 1;
    pending = {
      type: "Occupy",
      from: action.from,
      to: action.to,
      minMove,
      maxMove,
    };

    newCapturedThisTurn = true;

    // Check if defender is eliminated (has 0 territories remaining)
    const defenderId = toTerritory.ownerId;
    if (defenderId !== "neutral") {
      const defenderHasTerritories = Object.values(newTerritories).some(
        (t) => t.ownerId === defenderId,
      );
      if (!defenderHasTerritories) {
        // Player eliminated
        newPlayers = {
          ...(newPlayers ?? state.players),
          [defenderId]: { ...state.players[defenderId]!, status: "defeated" },
        };

        const eliminatedEvent: PlayerEliminated = {
          type: "PlayerEliminated",
          eliminatedId: defenderId,
          byId: playerId,
          cardsTransferred: [], // no-op until cards milestone
        };
        events.push(eliminatedEvent);

        // Check win condition: only 1 alive player remaining
        const playersRecord = newPlayers;
        const alivePlayers = state.turnOrder.filter(
          (pid) => playersRecord[pid]!.status === "alive",
        );
        if (alivePlayers.length === 1) {
          newPhase = "GameOver";
          const gameEndedEvent: GameEnded = {
            type: "GameEnded",
            winningPlayerId: alivePlayers[0],
          };
          events.push(gameEndedEvent);
        }
      }
    }
  }

  const newState: GameState = {
    ...state,
    players: newPlayers ?? state.players,
    territories: newTerritories,
    pending,
    capturedThisTurn: newCapturedThisTurn,
    turn: newPhase ? { ...state.turn, phase: newPhase } : state.turn,
    rng: rng.state,
    stateVersion: state.stateVersion + 1,
  };

  return { state: newState, events };
}

// ── Occupy handler ───────────────────────────────────────────────────

function handleOccupy(
  state: GameState,
  playerId: PlayerId,
  action: OccupyAction,
): ActionResult {
  // Must have a pending occupy
  if (!state.pending || state.pending.type !== "Occupy") {
    throw new ActionError("No pending Occupy to resolve");
  }

  // Current player check
  if (state.turn.currentPlayerId !== playerId) {
    throw new ActionError(
      `Not your turn: current player is ${state.turn.currentPlayerId}`,
    );
  }

  const { from, to, minMove, maxMove } = state.pending;

  // moveArmies validation
  if (!Number.isInteger(action.moveArmies)) {
    throw new ActionError(
      `Invalid moveArmies: must be an integer, got ${action.moveArmies}`,
    );
  }
  if (action.moveArmies < minMove) {
    throw new ActionError(
      `Must move at least ${minMove} armies, got ${action.moveArmies}`,
    );
  }
  if (action.moveArmies > maxMove) {
    throw new ActionError(
      `Cannot move more than ${maxMove} armies, got ${action.moveArmies}`,
    );
  }

  // Apply: move armies from source to captured territory
  const fromTerritory = state.territories[from]!;
  const toTerritory = state.territories[to]!;

  const newTerritories = {
    ...state.territories,
    [from]: { ...fromTerritory, armies: fromTerritory.armies - action.moveArmies },
    [to]: { ...toTerritory, armies: toTerritory.armies + action.moveArmies },
  };

  const event: OccupyResolved = {
    type: "OccupyResolved",
    from,
    to,
    moved: action.moveArmies,
  };

  const newState: GameState = {
    ...state,
    territories: newTerritories,
    pending: undefined,
    stateVersion: state.stateVersion + 1,
  };

  return { state: newState, events: [event] };
}

// ── EndAttackPhase handler ────────────────────────────────────────────

function handleEndAttackPhase(
  state: GameState,
  playerId: PlayerId,
): ActionResult {
  // Phase check
  if (state.turn.phase !== "Attack") {
    throw new ActionError(
      `Cannot end attack phase: current phase is ${state.turn.phase}, expected Attack`,
    );
  }

  // Current player check
  if (state.turn.currentPlayerId !== playerId) {
    throw new ActionError(
      `Not your turn: current player is ${state.turn.currentPlayerId}`,
    );
  }

  // No pending occupy
  if (state.pending) {
    throw new ActionError(
      `Cannot end attack phase while an Occupy is pending`,
    );
  }

  const newState: GameState = {
    ...state,
    turn: { ...state.turn, phase: "Fortify" },
    stateVersion: state.stateVersion + 1,
  };

  return { state: newState, events: [] };
}

// ── Dispatcher ────────────────────────────────────────────────────────

export function applyAction(
  state: GameState,
  playerId: PlayerId,
  action: Action,
  map?: GraphMap,
  combat?: CombatConfig,
): ActionResult {
  switch (action.type) {
    case "PlaceReinforcements":
      return handlePlaceReinforcements(state, playerId, action);
    case "Attack":
      if (!map) throw new ActionError("GraphMap is required for Attack actions");
      if (!combat) throw new ActionError("CombatConfig is required for Attack actions");
      return handleAttack(state, playerId, action, map, combat);
    case "Occupy":
      return handleOccupy(state, playerId, action);
    case "EndAttackPhase":
      return handleEndAttackPhase(state, playerId);
    case "TradeCards":
    case "Fortify":
    case "EndTurn":
      throw new ActionError(`Action ${action.type} is not yet implemented`);
  }
}
