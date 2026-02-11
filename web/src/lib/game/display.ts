import { NEUTRAL_PLAYER_COLOR, PLAYER_COLOR_PALETTE } from "risk-engine";
import type { GraphMap } from "risk-engine";

type PlayerRef = { displayName: string; enginePlayerId: string | null; color?: string | null };

export function getPlayerColor(playerId: string, players: PlayerRef[], turnOrder: string[]) {
  if (playerId === "neutral") return NEUTRAL_PLAYER_COLOR;
  const explicitColor = players.find((player) => player.enginePlayerId === playerId)?.color;
  if (explicitColor) return explicitColor;
  const idx = turnOrder.indexOf(playerId);
  return PLAYER_COLOR_PALETTE[idx % PLAYER_COLOR_PALETTE.length] ?? NEUTRAL_PLAYER_COLOR;
}

export function getPlayerName(enginePlayerId: string, players: PlayerRef[]) {
  return players.find((player) => player.enginePlayerId === enginePlayerId)?.displayName ?? enginePlayerId;
}

export function formatEvent(event: Record<string, unknown>, playerMap: PlayerRef[], graphMap?: GraphMap) {
  const playerName = (id: unknown) =>
    typeof id === "string" ? getPlayerName(id, playerMap) : "Unknown";
  const actionOwnerId = (id: unknown) =>
    typeof id === "string" ? getPlayerName(id, playerMap) : "Unknown";
  const territoryName = (id: unknown) =>
    typeof id === "string" ? graphMap?.territories[id]?.name ?? id : "Unknown";

  switch (event.type) {
    case "ReinforcementsPlaced":
      return `${playerName(event.playerId)} placed ${event.count} armies on ${territoryName(event.territoryId)}`;
    case "AttackResolved": {
      const attackerLosses = Number(event.attackerLosses ?? 0);
      const defenderLosses = Number(event.defenderLosses ?? 0);
      return `${territoryName(event.from)} attacked ${territoryName(event.to)} (attacker -${attackerLosses}, defender -${defenderLosses})`;
    }
    case "TerritoryCaptured":
      return `${playerName(event.newOwnerId)} captured ${territoryName(event.to)}`;
    case "OccupyResolved":
      return `${actionOwnerId(event.playerId)} moved ${event.moved} armies to ${territoryName(event.to)}`;
    case "FortifyResolved":
      return `${actionOwnerId(event.playerId)} fortified ${territoryName(event.from)} to ${territoryName(event.to)} (${event.moved})`;
    case "CardsTraded":
      return `${playerName(event.playerId)} traded cards for ${event.value} armies`;
    case "CardDrawn":
      return `${playerName(event.playerId)} drew a card`;
    case "TurnEnded":
      return `${playerName(event.playerId)} ended their turn`;
    case "TurnAdvanced":
      return `${playerName(event.nextPlayerId)} starts round ${event.round}`;
    case "PlayerEliminated":
      return `${playerName(event.eliminatedId)} was eliminated`;
    case "GameEnded":
      if (typeof event.winningPlayerId === "string") {
        return `${playerName(event.winningPlayerId)} won the game`;
      }
      if (typeof event.winningTeamId === "string") {
        return `${event.winningTeamId} won the game`;
      }
      return "Game ended";
    case "ReinforcementsGranted":
      return `${playerName(event.playerId)} received ${event.amount} reinforcements`;
    default:
      return String(event.type ?? "Event");
  }
}
