const PLAYER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#f97316", "#14b8a6"];
const NEUTRAL_COLOR = "#64748b";

type PlayerRef = { displayName: string; enginePlayerId: string | null };

export function getPlayerColor(playerId: string, turnOrder: string[]) {
  if (playerId === "neutral") return NEUTRAL_COLOR;
  const idx = turnOrder.indexOf(playerId);
  return PLAYER_COLORS[idx % PLAYER_COLORS.length] ?? NEUTRAL_COLOR;
}

export function getPlayerName(enginePlayerId: string, players: PlayerRef[]) {
  return players.find((player) => player.enginePlayerId === enginePlayerId)?.displayName ?? enginePlayerId;
}

export function formatEvent(event: Record<string, unknown>, playerMap: PlayerRef[]) {
  const playerName = (id: unknown) =>
    typeof id === "string" ? getPlayerName(id, playerMap) : "Unknown";

  switch (event.type) {
    case "ReinforcementsPlaced":
      return `${playerName(event.playerId)} placed ${event.count} armies on ${event.territoryId}`;
    case "AttackResolved":
      return `${event.from} attacked ${event.to} (${event.attackerLosses}/${event.defenderLosses} losses)`;
    case "TerritoryCaptured":
      return `${playerName(event.newOwnerId)} captured ${event.to}`;
    case "OccupyResolved":
      return `${playerName(event.playerId)} moved ${event.moved} armies to ${event.to}`;
    case "FortifyResolved":
      return `${playerName(event.playerId)} fortified ${event.from} to ${event.to} (${event.moved})`;
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
