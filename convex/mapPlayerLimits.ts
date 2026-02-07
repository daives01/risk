export interface MapPlayerLimits {
  minPlayers: number;
  maxPlayers: number;
}

export const DEFAULT_MIN_PLAYERS = 2;
export const DEFAULT_MAX_PLAYERS = 6;

function maxPlayersDefault(territoryCount?: number): number {
  if (territoryCount === undefined || !Number.isFinite(territoryCount)) {
    return DEFAULT_MAX_PLAYERS;
  }
  const normalizedTerritoryCount = Math.max(0, Math.floor(territoryCount));
  if (normalizedTerritoryCount === 0) return DEFAULT_MAX_PLAYERS;
  return Math.min(DEFAULT_MAX_PLAYERS, normalizedTerritoryCount);
}

export function defaultMapPlayerLimits(territoryCount?: number): MapPlayerLimits {
  return {
    minPlayers: DEFAULT_MIN_PLAYERS,
    maxPlayers: maxPlayersDefault(territoryCount),
  };
}

export function resolveMapPlayerLimits(
  playerLimits: MapPlayerLimits | undefined,
  territoryCount?: number,
): MapPlayerLimits {
  return playerLimits ?? defaultMapPlayerLimits(territoryCount);
}

export function validateMapPlayerLimits(
  playerLimits: MapPlayerLimits,
  territoryCount?: number,
): string[] {
  const errors: string[] = [];

  if (!Number.isInteger(playerLimits.minPlayers)) {
    errors.push("minPlayers must be an integer");
  }
  if (!Number.isInteger(playerLimits.maxPlayers)) {
    errors.push("maxPlayers must be an integer");
  }

  if (playerLimits.minPlayers < DEFAULT_MIN_PLAYERS) {
    errors.push(`minPlayers must be at least ${DEFAULT_MIN_PLAYERS}`);
  }

  if (playerLimits.maxPlayers < playerLimits.minPlayers) {
    errors.push("maxPlayers must be greater than or equal to minPlayers");
  }

  if (territoryCount !== undefined && Number.isFinite(territoryCount)) {
    const normalizedTerritoryCount = Math.max(0, Math.floor(territoryCount));
    if (playerLimits.maxPlayers > normalizedTerritoryCount) {
      errors.push(
        `maxPlayers cannot exceed territory count (${normalizedTerritoryCount})`,
      );
    }
  }

  return errors;
}
