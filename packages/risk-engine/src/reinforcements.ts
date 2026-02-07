import type { PlayerId, TerritoryId, TeamId } from "./types.js";
import type { GraphMap } from "./map.js";
import type { GameState } from "./types.js";
import type { TeamsConfig } from "./config.js";

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
  teamsConfig?: TeamsConfig,
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
    const playerTeamId = state.players[playerId]?.teamId;
    const teamBonusMode = teamsConfig?.teamsEnabled && teamsConfig.continentBonusRecipient === "majorityHolderOnTeam";

    for (const [cid, continent] of Object.entries(map.continents)) {
      if (continent.territoryIds.length === 0) continue;

      if (!teamBonusMode || !playerTeamId) {
        if (continent.territoryIds.every((tid) => ownedSet.has(tid))) {
          sources[cid] = continent.bonus;
          total += continent.bonus;
        }
        continue;
      }

      const majorityHolder = findTeamContinentBonusRecipient(
        state,
        continent.territoryIds,
      );
      if (majorityHolder.teamId === playerTeamId && majorityHolder.playerId === playerId) {
        sources[cid] = continent.bonus;
        total += continent.bonus;
      }
    }
  }

  return { total, sources };
}

function findTeamContinentBonusRecipient(
  state: GameState,
  territoryIds: readonly TerritoryId[],
): { teamId?: TeamId; playerId?: PlayerId } {
  let owningTeamId: TeamId | undefined;
  const playerCounts = new Map<PlayerId, number>();

  for (const territoryId of territoryIds) {
    const territory = state.territories[territoryId];
    if (!territory || territory.ownerId === "neutral") {
      return {};
    }

    const ownerId = territory.ownerId;
    const teamId = state.players[ownerId]?.teamId;
    if (!teamId) return {};

    if (!owningTeamId) {
      owningTeamId = teamId;
    } else if (owningTeamId !== teamId) {
      return {};
    }

    playerCounts.set(ownerId, (playerCounts.get(ownerId) ?? 0) + 1);
  }

  if (!owningTeamId || playerCounts.size === 0) return {};

  let winnerPlayerId: PlayerId | undefined;
  let winnerCount = -1;
  const sortedPlayers = [...playerCounts.keys()].sort();
  for (const playerId of sortedPlayers) {
    const count = playerCounts.get(playerId) ?? 0;
    if (count > winnerCount) {
      winnerPlayerId = playerId;
      winnerCount = count;
    }
  }

  return {
    teamId: owningTeamId,
    playerId: winnerPlayerId,
  };
}
