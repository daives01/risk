import type {
  Action,
  CardId,
  CardKind,
  GameState,
  PlayerId,
  TerritoryId,
} from "./types.js";
import type { GraphMap } from "./map.js";
import type { CombatConfig, CardsConfig, FortifyConfig, TeamsConfig } from "./config.js";
import { canPlace, canAttack, canFortifyFrom, canFortifyTo, canTraverse } from "./permissions.js";

// ── Trade set helpers (duplicated from engine.ts to avoid circular deps) ──

function isValidTradeSet(
  kinds: readonly CardKind[],
  tradeSets: { allowThreeOfAKind: boolean; allowOneOfEach: boolean; wildActsAsAny: boolean },
): boolean {
  if (kinds.length !== 3) return false;
  const nonWildKinds = kinds.filter((k) => k !== "W");
  const wildCount = kinds.length - nonWildKinds.length;
  if (!tradeSets.wildActsAsAny && wildCount > 0) return false;
  if (tradeSets.allowThreeOfAKind) {
    const uniqueNonWild = new Set(nonWildKinds);
    if (uniqueNonWild.size <= 1) return true;
  }
  if (tradeSets.allowOneOfEach) {
    const uniqueNonWild = new Set(nonWildKinds);
    if (uniqueNonWild.size + wildCount >= 3 && uniqueNonWild.size === nonWildKinds.length) {
      return true;
    }
  }
  return false;
}

// ── BFS connectivity (duplicated from engine.ts) ─────────────────────

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

// ── Find valid trade card combinations ───────────────────────────────

function findValidTradeSets(
  hand: readonly CardId[],
  cardsById: Record<string, { readonly kind: CardKind }>,
  tradeSets: { allowThreeOfAKind: boolean; allowOneOfEach: boolean; wildActsAsAny: boolean },
): readonly CardId[][] {
  const results: CardId[][] = [];
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        const ids = [hand[i]!, hand[j]!, hand[k]!];
        const kinds = ids.map((id) => cardsById[id]!.kind);
        if (isValidTradeSet(kinds, tradeSets)) {
          results.push(ids);
        }
      }
    }
  }
  return results;
}

// ── getLegalActions ──────────────────────────────────────────────────

export interface LegalActionsConfig {
  readonly map: GraphMap;
  readonly combat?: CombatConfig;
  readonly fortify?: FortifyConfig;
  readonly cards?: CardsConfig;
  readonly teams?: TeamsConfig;
}

/**
 * Returns all legal actions for the current player in the current phase.
 *
 * For actions with a count/amount parameter (PlaceReinforcements, Fortify, Occupy),
 * a single representative action is returned per valid target. The consumer can
 * choose any valid value within the allowed range.
 */
export function getLegalActions(
  state: GameState,
  config: LegalActionsConfig,
): readonly Action[] {
  const { phase, currentPlayerId: playerId } = state.turn;

  switch (phase) {
    case "Setup":
    case "GameOver":
      return [];

    case "Reinforcement":
      return getReinforcementActions(state, playerId, config);

    case "Attack":
      return getAttackActions(state, playerId, config);

    case "Occupy":
      return getOccupyActions(state);

    case "Fortify":
      return getFortifyActions(state, playerId, config);
  }
}

// ── Phase-specific generators ────────────────────────────────────────

function getReinforcementActions(
  state: GameState,
  playerId: PlayerId,
  config: LegalActionsConfig,
): Action[] {
  const actions: Action[] = [];
  const hand = state.hands[playerId] ?? [];
  const remaining = state.reinforcements?.remaining ?? 0;

  // Check forced trade: must trade before placing if hand >= threshold
  const mustTrade = config.cards !== undefined && hand.length >= config.cards.forcedTradeHandSize;

  // TradeCards: find all valid 3-card combinations
  if (config.cards && hand.length >= 3) {
    const validSets = findValidTradeSets(hand, state.cardsById, config.cards.tradeSets);
    for (const cardIds of validSets) {
      actions.push({ type: "TradeCards", cardIds: cardIds as CardId[] });
    }
  }

  // PlaceReinforcements: one per valid territory (if not forced to trade first)
  if (!mustTrade && remaining > 0) {
    const territoryIds = Object.keys(state.territories) as TerritoryId[];
    for (const tid of territoryIds) {
      const territory = state.territories[tid]!;
      if (canPlace(playerId, territory.ownerId, state.players, config.teams)) {
        actions.push({ type: "PlaceReinforcements", territoryId: tid, count: remaining });
      }
    }
  }

  return actions;
}

function getAttackActions(
  state: GameState,
  playerId: PlayerId,
  config: LegalActionsConfig,
): Action[] {
  const actions: Action[] = [];

  // If there's a pending occupy, only Occupy actions are valid (handled by Occupy phase)
  // But during Attack phase with pending, no attack/end actions
  if (state.pending) return [];

  // EndAttackPhase is always valid when no pending occupy
  actions.push({ type: "EndAttackPhase" });

  // Attack: for each owned territory with >= 2 armies, for each adjacent attackable target
  const { map, combat, teams } = config;
  const territoryIds = Object.keys(state.territories) as TerritoryId[];

  for (const fromId of territoryIds) {
    const from = state.territories[fromId]!;
    if (from.ownerId !== playerId) continue;
    if (from.armies < 2) continue;

    const neighbors = map.adjacency[fromId];
    if (!neighbors) continue;

    for (const toId of neighbors) {
      const to = state.territories[toId];
      if (!to) continue;
      if (!canAttack(playerId, to.ownerId, state.players, teams)) continue;

      // Generate attack actions: if dice choice allowed, one per valid dice count
      if (combat?.allowAttackerDiceChoice) {
        const maxDice = Math.min(combat.maxAttackDice, from.armies - 1);
        for (let dice = 1; dice <= maxDice; dice++) {
          actions.push({ type: "Attack", from: fromId, to: toId, attackerDice: dice });
        }
      } else {
        actions.push({ type: "Attack", from: fromId, to: toId });
      }
    }
  }

  return actions;
}

function getOccupyActions(state: GameState): Action[] {
  if (!state.pending || state.pending.type !== "Occupy") return [];

  const { minMove, maxMove } = state.pending;
  const actions: Action[] = [];
  for (let moveArmies = minMove; moveArmies <= maxMove; moveArmies++) {
    actions.push({ type: "Occupy", moveArmies });
  }
  return actions;
}

function getFortifyActions(
  state: GameState,
  playerId: PlayerId,
  config: LegalActionsConfig,
): Action[] {
  const actions: Action[] = [];

  // EndTurn is always valid in Fortify phase
  actions.push({ type: "EndTurn" });

  const { map, fortify, teams } = config;
  if (!fortify) return actions;

  const territoryIds = Object.keys(state.territories) as TerritoryId[];

  // Collect valid "from" territories (owned/team, >= 2 armies)
  const validFromIds: TerritoryId[] = [];
  for (const tid of territoryIds) {
    const t = state.territories[tid]!;
    if (t.armies < 2) continue;
    if (!canFortifyFrom(playerId, t.ownerId, state.players, teams)) continue;
    validFromIds.push(tid);
  }

  // Collect valid "to" territories
  const validToIds: TerritoryId[] = [];
  for (const tid of territoryIds) {
    const t = state.territories[tid]!;
    if (!canFortifyTo(playerId, t.ownerId, state.players, teams)) continue;
    validToIds.push(tid);
  }

  for (const fromId of validFromIds) {
    const from = state.territories[fromId]!;
    const maxCount = from.armies - 1;

    for (const toId of validToIds) {
      if (fromId === toId) continue;

      // Check connectivity
      if (fortify.fortifyMode === "adjacent") {
        const neighbors = map.adjacency[fromId];
        if (!neighbors || !neighbors.includes(toId)) continue;
      } else {
        if (!isConnected(fromId, toId, playerId, state, map, teams)) continue;
      }

      actions.push({ type: "Fortify", from: fromId, to: toId, count: maxCount });
    }
  }

  return actions;
}
