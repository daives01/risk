import type { PlayerId, TerritoryId, ContinentId } from "./types.js";
import type { GraphMap } from "./map.js";
import type { GameState, ReinforcementState } from "./types.js";

export interface ReinforcementResult {
  readonly total: number;
  readonly sources: Record<string, number>;
}

/**
 * Calculate reinforcements for a player based on territory count and continent bonuses.
 *
 * - Base: max(3, floor(ownedTerritoryCount / 3))
 * - Continent bonus: for each continent fully controlled by the player, add the continent's bonus
 */
export function calculateReinforcements(
  state: GameState,
  playerId: PlayerId,
  map: GraphMap,
): ReinforcementResult {
  // Count territories owned by this player
  const ownedTerritories: TerritoryId[] = [];
  for (const [tid, ts] of Object.entries(state.territories)) {
    if (ts.ownerId === playerId) {
      ownedTerritories.push(tid as TerritoryId);
    }
  }

  const territoryCount = ownedTerritories.length;
  const base = Math.max(3, Math.floor(territoryCount / 3));

  const sources: Record<string, number> = { territory: base };
  let total = base;

  // Continent bonuses
  if (map.continents) {
    const ownedSet = new Set<string>(ownedTerritories);
    for (const [cid, continent] of Object.entries(map.continents)) {
      if (
        continent.territoryIds.length > 0 &&
        continent.territoryIds.every((tid) => ownedSet.has(tid))
      ) {
        sources[cid] = continent.bonus;
        total += continent.bonus;
      }
    }
  }

  return { total, sources };
}
