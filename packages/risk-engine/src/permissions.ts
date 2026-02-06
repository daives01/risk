import type { PlayerId, PlayerState, TeamId } from "./types.js";
import type { TeamsConfig } from "./config.js";

// ── Helpers ──────────────────────────────────────────────────────────

function sameTeam(
  actorTeamId: TeamId | undefined,
  otherTeamId: TeamId | undefined,
): boolean {
  return actorTeamId !== undefined && otherTeamId !== undefined && actorTeamId === otherTeamId;
}

// ── Permission functions ─────────────────────────────────────────────

/** Can the actor place reinforcements on this territory? */
export function canPlace(
  actorId: PlayerId,
  territoryOwnerId: PlayerId | "neutral",
  players: Record<string, PlayerState>,
  teams?: TeamsConfig,
): boolean {
  if (territoryOwnerId === actorId) return true;
  if (!teams?.teamsEnabled) return false;
  if (territoryOwnerId === "neutral") return false;
  if (!teams.allowPlaceOnTeammate) return false;
  return sameTeam(players[actorId]?.teamId, players[territoryOwnerId]?.teamId);
}

/** Can the actor attack the target territory? */
export function canAttack(
  actorId: PlayerId,
  targetOwnerId: PlayerId | "neutral",
  players: Record<string, PlayerState>,
  teams?: TeamsConfig,
): boolean {
  // Cannot attack own territory
  if (targetOwnerId === actorId) return false;
  // Can always attack neutral
  if (targetOwnerId === "neutral") return true;
  // If teams disabled, can attack anyone else
  if (!teams?.teamsEnabled) return true;
  // If teams enabled, check friendly fire rule
  if (teams.preventAttackingTeammates) {
    return !sameTeam(players[actorId]?.teamId, players[targetOwnerId]?.teamId);
  }
  return true;
}

/** Can the actor fortify FROM this territory? */
export function canFortifyFrom(
  actorId: PlayerId,
  territoryOwnerId: PlayerId | "neutral",
  players: Record<string, PlayerState>,
  teams?: TeamsConfig,
): boolean {
  if (territoryOwnerId === actorId) return true;
  if (!teams?.teamsEnabled) return false;
  if (territoryOwnerId === "neutral") return false;
  if (!teams.allowFortifyWithTeammate) return false;
  return sameTeam(players[actorId]?.teamId, players[territoryOwnerId]?.teamId);
}

/** Can the actor fortify TO this territory? */
export function canFortifyTo(
  actorId: PlayerId,
  territoryOwnerId: PlayerId | "neutral",
  players: Record<string, PlayerState>,
  teams?: TeamsConfig,
): boolean {
  if (territoryOwnerId === actorId) return true;
  if (!teams?.teamsEnabled) return false;
  if (territoryOwnerId === "neutral") return false;
  if (!teams.allowFortifyWithTeammate) return false;
  return sameTeam(players[actorId]?.teamId, players[territoryOwnerId]?.teamId);
}

/** Can the actor traverse through this territory for connected fortify? */
export function canTraverse(
  actorId: PlayerId,
  territoryOwnerId: PlayerId | "neutral",
  players: Record<string, PlayerState>,
  teams?: TeamsConfig,
): boolean {
  if (territoryOwnerId === actorId) return true;
  if (!teams?.teamsEnabled) return false;
  if (territoryOwnerId === "neutral") return false;
  if (!teams.allowFortifyThroughTeammates) return false;
  return sameTeam(players[actorId]?.teamId, players[territoryOwnerId]?.teamId);
}
