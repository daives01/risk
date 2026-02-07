import { PLAYER_COLOR_PALETTE } from "risk-engine";

type LobbyPlayer = {
  userId: string;
  color: string;
};

export function canEditLobbyPlayerColor(
  isHost: boolean,
  currentUserId: string,
  targetUserId: string,
) {
  return isHost || currentUserId === targetUserId;
}

export function getLobbyColorOptions(
  players: readonly LobbyPlayer[],
  targetUserId: string,
  pendingColors: Readonly<Record<string, string>>,
) {
  const effectiveColorByUserId: Record<string, string> = {};
  for (const player of players) {
    effectiveColorByUserId[player.userId] = pendingColors[player.userId] ?? player.color;
  }

  const takenByOthers = new Set<string>();
  for (const player of players) {
    if (player.userId === targetUserId) continue;
    const color = effectiveColorByUserId[player.userId];
    if (color) takenByOthers.add(color);
  }

  return PLAYER_COLOR_PALETTE.map((color) => ({
    color,
    disabled: takenByOthers.has(color),
  }));
}
