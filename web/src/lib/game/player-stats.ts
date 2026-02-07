import type { PublicState } from "./types";

export interface PlayerPanelStats {
  playerId: string;
  territories: number;
  armies: number;
  reserveTroops: number;
  cards: number;
  status: string;
  teamId?: string;
}

export function buildPlayerPanelStats(state: PublicState): PlayerPanelStats[] {
  const territoryCounts: Record<string, number> = {};
  const armyCounts: Record<string, number> = {};

  for (const territory of Object.values(state.territories)) {
    territoryCounts[territory.ownerId] = (territoryCounts[territory.ownerId] ?? 0) + 1;
    armyCounts[territory.ownerId] = (armyCounts[territory.ownerId] ?? 0) + territory.armies;
  }

  return state.turnOrder.map((playerId) => ({
    playerId,
    territories: territoryCounts[playerId] ?? 0,
    armies: armyCounts[playerId] ?? 0,
    reserveTroops: state.turn.currentPlayerId === playerId ? state.reinforcements?.remaining ?? 0 : 0,
    cards: state.handSizes[playerId] ?? 0,
    status: state.players[playerId]?.status ?? "alive",
    teamId: state.players[playerId]?.teamId,
  }));
}

