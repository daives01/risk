import type {
  Action,
  AttackAction,
  AttackResolved,
  CardDrawn,
  CardId,
  CardKind,
  CardsTraded,
  Fortify,
  FortifyResolved,
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
  TeamId,
  PlaceReinforcements,
  ReinforcementsGranted,
  ReinforcementsPlaced,
  TerritoryCaptured,
  TerritoryId,
  TradeCards,
  TurnAdvanced,
  TurnEnded,
} from "./types.js";
import type { GraphMap } from "./map.js";
import type { CombatConfig, CardsConfig, FortifyConfig, TeamsConfig } from "./config.js";
import { createRng } from "./rng.js";
import { calculateReinforcements } from "./reinforcements.js";
import { drawCard } from "./cards.js";
import { canPlace, canAttack, canFortifyFrom, canFortifyTo, canTraverse } from "./permissions.js";

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

function resolveWinner(
  players: Record<string, PlayerState>,
  turnOrder: readonly PlayerId[],
  teamsConfig?: TeamsConfig,
): { winningPlayerId?: PlayerId; winningTeamId?: TeamId } | null {
  const alivePlayers = turnOrder.filter((pid) => players[pid]!.status === "alive");
  if (alivePlayers.length === 0) return null;

  if (!teamsConfig?.teamsEnabled || teamsConfig.winCondition !== "lastTeamStanding") {
    if (alivePlayers.length !== 1) return null;
    return { winningPlayerId: alivePlayers[0] };
  }

  const aliveTeams = new Set<string>();
  for (const playerId of alivePlayers) {
    const teamId = players[playerId]?.teamId;
    if (teamId) {
      aliveTeams.add(teamId);
    } else {
      // Players without team assignment count as separate teams.
      aliveTeams.add(`solo:${playerId}`);
    }
  }

  if (aliveTeams.size !== 1) return null;
  const winningTeamId = players[alivePlayers[0]!]!.teamId;
  return {
    ...(alivePlayers.length === 1 ? { winningPlayerId: alivePlayers[0] } : {}),
    ...(winningTeamId ? { winningTeamId } : {}),
  };
}

// ── Action handlers ───────────────────────────────────────────────────

function handlePlaceReinforcements(
  state: GameState,
  playerId: PlayerId,
  action: PlaceReinforcements,
  cardsConfig?: CardsConfig,
  teamsConfig?: TeamsConfig,
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
  if (!canPlace(playerId, territory.ownerId, state.players, teamsConfig)) {
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

  // Forced trade check: must trade cards before placing if hand is too large
  if (cardsConfig) {
    const hand = state.hands[playerId] ?? [];
    if (hand.length >= cardsConfig.forcedTradeHandSize) {
      throw new ActionError(
        `Must trade cards before placing reinforcements (hand size ${hand.length} >= ${cardsConfig.forcedTradeHandSize})`,
      );
    }
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
  teamsConfig?: TeamsConfig,
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

  // Target must be attackable (not self, not teammate if prevented)
  if (!canAttack(playerId, toTerritory.ownerId, state.players, teamsConfig)) {
    if (toTerritory.ownerId === playerId) {
      throw new ActionError(
        `Cannot attack your own territory ${action.to}`,
      );
    }
    throw new ActionError(
      `Cannot attack teammate territory ${action.to}`,
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
  let newHands = state.hands;

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

        // Transfer cards from eliminated player to attacker
        const defenderCards: readonly CardId[] = newHands[defenderId] ?? [];
        const attackerCards: readonly CardId[] = newHands[playerId] ?? [];
        newHands = {
          ...newHands,
          [defenderId]: [],
          [playerId]: [...attackerCards, ...defenderCards],
        };

        const eliminatedEvent: PlayerEliminated = {
          type: "PlayerEliminated",
          eliminatedId: defenderId,
          byId: playerId,
          cardsTransferred: defenderCards,
        };
        events.push(eliminatedEvent);

        const winner = resolveWinner(newPlayers, state.turnOrder, teamsConfig);
        if (winner) {
          newPhase = "GameOver";
          const gameEndedEvent: GameEnded = {
            type: "GameEnded",
            ...winner,
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
    hands: newHands,
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
    playerId,
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

// ── Fortify handler ──────────────────────────────────────────────────

function isConnected(
  from: TerritoryId,
  to: TerritoryId,
  playerId: PlayerId,
  state: GameState,
  map: GraphMap,
  teamsConfig?: TeamsConfig,
): boolean {
  const visited = new Set<string>();
  const queue: TerritoryId[] = [from];
  visited.add(from);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === to) return true;

    const neighbors = map.adjacency[current];
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      const territory = state.territories[neighbor];
      if (territory && canTraverse(playerId, territory.ownerId, state.players, teamsConfig)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return false;
}

function handleFortify(
  state: GameState,
  playerId: PlayerId,
  action: Fortify,
  map: GraphMap,
  fortify: FortifyConfig,
  teamsConfig?: TeamsConfig,
): ActionResult {
  // Phase check
  if (state.turn.phase !== "Fortify") {
    throw new ActionError(
      `Cannot fortify: current phase is ${state.turn.phase}, expected Fortify`,
    );
  }

  // Current player check
  if (state.turn.currentPlayerId !== playerId) {
    throw new ActionError(
      `Not your turn: current player is ${state.turn.currentPlayerId}`,
    );
  }

  const fortifiesUsedThisTurn = state.fortifiesUsedThisTurn ?? 0;
  if (fortifiesUsedThisTurn >= fortify.maxFortifiesPerTurn) {
    throw new ActionError(
      `Cannot fortify: reached max fortifies per turn (${fortify.maxFortifiesPerTurn})`,
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

  // Both territories must be accessible by the player
  if (!canFortifyFrom(playerId, fromTerritory.ownerId, state.players, teamsConfig)) {
    throw new ActionError(
      `Territory ${action.from} is not owned by ${playerId}`,
    );
  }
  if (!canFortifyTo(playerId, toTerritory.ownerId, state.players, teamsConfig)) {
    throw new ActionError(
      `Territory ${action.to} is not owned by ${playerId}`,
    );
  }

  // Cannot fortify to same territory
  if (action.from === action.to) {
    throw new ActionError(`Cannot fortify from a territory to itself`);
  }

  // Count validation
  if (!Number.isInteger(action.count) || action.count < 1) {
    throw new ActionError(
      `Invalid count: must be a positive integer, got ${action.count}`,
    );
  }

  // Must leave at least 1 army
  if (action.count >= fromTerritory.armies) {
    throw new ActionError(
      `Cannot move ${action.count} armies: must leave at least 1 army on ${action.from} (has ${fromTerritory.armies})`,
    );
  }

  // Connectivity check based on fortify mode
  if (fortify.fortifyMode === "adjacent") {
    const neighbors = map.adjacency[action.from];
    if (!neighbors || !neighbors.includes(action.to)) {
      throw new ActionError(
        `Territory ${action.from} is not adjacent to ${action.to}`,
      );
    }
  } else {
    // connected mode: BFS through player-owned/team territories
    if (!isConnected(action.from, action.to, playerId, state, map, teamsConfig)) {
      throw new ActionError(
        `No connected path from ${action.from} to ${action.to} through your territories`,
      );
    }
  }

  // Apply: move armies
  const newTerritories = {
    ...state.territories,
    [action.from]: { ...fromTerritory, armies: fromTerritory.armies - action.count },
    [action.to]: { ...toTerritory, armies: toTerritory.armies + action.count },
  };

  const event: FortifyResolved = {
    type: "FortifyResolved",
    playerId,
    from: action.from,
    to: action.to,
    moved: action.count,
  };

  const newState: GameState = {
    ...state,
    territories: newTerritories,
    fortifiesUsedThisTurn: fortifiesUsedThisTurn + 1,
    stateVersion: state.stateVersion + 1,
  };

  return { state: newState, events: [event] };
}

// ── TradeCards handler ───────────────────────────────────────────────

function isValidTradeSet(
  kinds: readonly CardKind[],
  tradeSets: { allowThreeOfAKind: boolean; allowOneOfEach: boolean; wildActsAsAny: boolean },
): boolean {
  if (kinds.length !== 3) return false;

  // Separate wilds from non-wilds
  const nonWildKinds = kinds.filter((k) => k !== "W");
  const wildCount = kinds.length - nonWildKinds.length;

  if (!tradeSets.wildActsAsAny && wildCount > 0) {
    // Wilds don't substitute — treat them literally; W is not A, B, or C
    // With wilds not acting as any, no valid set can include wilds
    return false;
  }

  // With wilds acting as substitutes:
  // Three-of-a-kind: all non-wilds must be the same kind
  if (tradeSets.allowThreeOfAKind) {
    const uniqueNonWild = new Set(nonWildKinds);
    if (uniqueNonWild.size <= 1) return true; // 0 or 1 unique non-wild kind + wilds
  }

  // One-of-each: need 3 distinct kinds (wilds fill gaps)
  if (tradeSets.allowOneOfEach) {
    const uniqueNonWild = new Set(nonWildKinds);
    // Need at least (3 - wildCount) distinct non-wild kinds to fill 3 slots
    if (uniqueNonWild.size + wildCount >= 3 && uniqueNonWild.size === nonWildKinds.length) {
      // Each non-wild must be unique (no duplicates) for one-of-each
      return true;
    }
  }

  return false;
}

function handleTradeCards(
  state: GameState,
  playerId: PlayerId,
  action: TradeCards,
  cardsConfig: CardsConfig,
): ActionResult {
  // Phase check
  if (state.turn.phase !== "Reinforcement") {
    throw new ActionError(
      `Cannot trade cards: current phase is ${state.turn.phase}, expected Reinforcement`,
    );
  }

  // Current player check
  if (state.turn.currentPlayerId !== playerId) {
    throw new ActionError(
      `Not your turn: current player is ${state.turn.currentPlayerId}`,
    );
  }

  // Must trade exactly 3 cards
  if (action.cardIds.length !== 3) {
    throw new ActionError(
      `Must trade exactly 3 cards, got ${action.cardIds.length}`,
    );
  }

  // Cards must be in player's hand
  const hand: readonly CardId[] = state.hands[playerId] ?? [];
  for (const cardId of action.cardIds) {
    if (!hand.includes(cardId)) {
      throw new ActionError(
        `Card ${cardId} is not in your hand`,
      );
    }
  }

  // No duplicate card IDs
  const uniqueIds = new Set(action.cardIds);
  if (uniqueIds.size !== action.cardIds.length) {
    throw new ActionError("Duplicate card IDs in trade");
  }

  // Validate set
  const kinds = action.cardIds.map((id) => state.cardsById[id]!.kind);
  if (!isValidTradeSet(kinds, cardsConfig.tradeSets)) {
    throw new ActionError("Invalid trade set");
  }

  // Compute trade value
  const tradeIndex = state.tradesCompleted;
  const { tradeValues, tradeValueOverflow } = cardsConfig;
  const tradeValue = tradeIndex < tradeValues.length
    ? tradeValues[tradeIndex]!
    : tradeValueOverflow === "continueByFive"
      ? tradeValues[tradeValues.length - 1]! + (tradeIndex - tradeValues.length + 1) * 5
      : tradeValues[tradeValues.length - 1]!;

  // Territory trade bonus
  let bonus = 0;
  if (cardsConfig.territoryTradeBonus.enabled) {
    for (const cardId of action.cardIds) {
      const card = state.cardsById[cardId]!;
      if (card.territoryId) {
        const territory = state.territories[card.territoryId];
        if (territory && territory.ownerId === playerId) {
          bonus = cardsConfig.territoryTradeBonus.bonusArmies;
          break; // Only apply once per trade
        }
      }
    }
  }

  const totalValue = tradeValue + bonus;

  // Update hand: remove traded cards
  const tradedSet = new Set<string>(action.cardIds);
  const newHand = hand.filter((id) => !tradedSet.has(id));

  // Update deck: add traded cards to discard
  const newDiscard = [...state.deck.discard, ...action.cardIds];

  // Update reinforcements
  const currentRemaining = state.reinforcements?.remaining ?? 0;
  const currentSources = state.reinforcements?.sources ?? {};
  const tradeSources = (currentSources["trade"] ?? 0) + totalValue;

  const newState: GameState = {
    ...state,
    hands: {
      ...state.hands,
      [playerId]: newHand,
    },
    deck: {
      ...state.deck,
      discard: newDiscard,
    },
    tradesCompleted: state.tradesCompleted + 1,
    reinforcements: {
      remaining: currentRemaining + totalValue,
      sources: {
        ...currentSources,
        trade: tradeSources,
      },
    },
    stateVersion: state.stateVersion + 1,
  };

  const event: CardsTraded = {
    type: "CardsTraded",
    playerId,
    cardIds: action.cardIds,
    value: totalValue,
    tradesCompletedAfter: state.tradesCompleted + 1,
  };

  return { state: newState, events: [event] };
}

// ── EndTurn handler ──────────────────────────────────────────────────

function handleEndTurn(
  state: GameState,
  playerId: PlayerId,
  map: GraphMap,
  cardsConfig?: CardsConfig,
  teamsConfig?: TeamsConfig,
): ActionResult {
  // Phase check: valid in Fortify phase
  if (state.turn.phase !== "Fortify") {
    throw new ActionError(
      `Cannot end turn: current phase is ${state.turn.phase}, expected Fortify`,
    );
  }

  // Current player check
  if (state.turn.currentPlayerId !== playerId) {
    throw new ActionError(
      `Not your turn: current player is ${state.turn.currentPlayerId}`,
    );
  }

  const events: GameEvent[] = [];
  let currentDeck = state.deck;
  let currentHands = state.hands;
  let rngState = state.rng;

  // Card draw: if player captured a territory this turn and config awards cards
  if (state.capturedThisTurn && cardsConfig?.awardCardOnCapture) {
    const rng = createRng(rngState);
    const result = drawCard(currentDeck, rng);
    if (result) {
      currentDeck = result.deck;
      const playerHand = currentHands[playerId] ?? [];
      currentHands = {
        ...currentHands,
        [playerId]: [...playerHand, result.cardId],
      };
      rngState = rng.state;

      const cardDrawnEvent: CardDrawn = {
        type: "CardDrawn",
        playerId,
        cardId: result.cardId,
      };
      events.push(cardDrawnEvent);
    }
  }

  // TurnEnded event
  const turnEndedEvent: TurnEnded = {
    type: "TurnEnded",
    playerId,
  };
  events.push(turnEndedEvent);

  // Find next alive player in turnOrder
  const { turnOrder } = state;
  const currentIndex = turnOrder.indexOf(playerId);
  let nextIndex = currentIndex;
  let wrapped = false;

  do {
    nextIndex = (nextIndex + 1) % turnOrder.length;
    if (nextIndex <= currentIndex && nextIndex !== currentIndex) {
      wrapped = true;
    }
    // If we wrapped past index 0, we've completed a round
    if (nextIndex === 0 && currentIndex !== 0) {
      wrapped = true;
    }
  } while (state.players[turnOrder[nextIndex]!]!.status !== "alive");

  const nextPlayerId = turnOrder[nextIndex]!;
  const newRound = wrapped ? state.turn.round + 1 : state.turn.round;

  // TurnAdvanced event
  const turnAdvancedEvent: TurnAdvanced = {
    type: "TurnAdvanced",
    nextPlayerId,
    round: newRound,
  };
  events.push(turnAdvancedEvent);

  // Calculate reinforcements for next player
  const reinforcementResult = calculateReinforcements(
    state,
    nextPlayerId,
    map,
    teamsConfig,
    state.turnOrder,
  );

  const reinforcementsGrantedEvent: ReinforcementsGranted = {
    type: "ReinforcementsGranted",
    playerId: nextPlayerId,
    amount: reinforcementResult.total,
    sources: reinforcementResult.sources,
  };
  events.push(reinforcementsGrantedEvent);

  const newState: GameState = {
    ...state,
    turn: {
      currentPlayerId: nextPlayerId,
      phase: "Reinforcement",
      round: newRound,
    },
    capturedThisTurn: false,
    fortifiesUsedThisTurn: 0,
    deck: currentDeck,
    hands: currentHands,
    rng: rngState,
    reinforcements: {
      remaining: reinforcementResult.total,
      sources: reinforcementResult.sources,
    },
    stateVersion: state.stateVersion + 1,
  };

  return { state: newState, events };
}

// ── Dispatcher ────────────────────────────────────────────────────────

export function applyAction(
  state: GameState,
  playerId: PlayerId,
  action: Action,
  map?: GraphMap,
  combat?: CombatConfig,
  fortifyConfig?: FortifyConfig,
  cardsConfig?: CardsConfig,
  teamsConfig?: TeamsConfig,
): ActionResult {
  switch (action.type) {
    case "PlaceReinforcements":
      return handlePlaceReinforcements(state, playerId, action, cardsConfig, teamsConfig);
    case "Attack":
      if (!map) throw new ActionError("GraphMap is required for Attack actions");
      if (!combat) throw new ActionError("CombatConfig is required for Attack actions");
      return handleAttack(state, playerId, action, map, combat, teamsConfig);
    case "Occupy":
      return handleOccupy(state, playerId, action);
    case "EndAttackPhase":
      return handleEndAttackPhase(state, playerId);
    case "Fortify":
      if (!map) throw new ActionError("GraphMap is required for Fortify actions");
      if (!fortifyConfig) throw new ActionError("FortifyConfig is required for Fortify actions");
      return handleFortify(state, playerId, action, map, fortifyConfig, teamsConfig);
    case "EndTurn":
      if (!map) throw new ActionError("GraphMap is required for EndTurn actions");
      return handleEndTurn(state, playerId, map, cardsConfig, teamsConfig);
    case "TradeCards":
      if (!cardsConfig) throw new ActionError("CardsConfig is required for TradeCards actions");
      return handleTradeCards(state, playerId, action, cardsConfig);
  }
}
