import { PLAYER_COLOR_NAME_BY_HEX, PLAYER_COLOR_PALETTE } from "risk-engine";

type LobbyPlayer = {
  userId: string;
  color: string;
};

// Ordered for lobby picker scanning: cool hues -> warm hues -> neutrals.
const LOBBY_COLOR_DISPLAY_ORDER = [
  "#08008a", // Navy
  "#556dff", // Royal Blue
  "#00bec2", // Cyan
  "#005d59", // Teal
  "#209600", // Green
  "#647d14", // Lime
  "#ffa210", // Orange
  "#ca0424", // Carmine
  "#ff41ff", // Magenta
  "#710079", // Purple
  "#593500", // Brown
  "#000000", // Black
] as const;

const DISPLAY_ORDER_INDEX = new Map<string, number>(
  LOBBY_COLOR_DISPLAY_ORDER.map((color, index) => [color, index]),
);

function getOrderedLobbyPalette() {
  return [...PLAYER_COLOR_PALETTE].sort((a, b) => {
    const aIndex = DISPLAY_ORDER_INDEX.get(a) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = DISPLAY_ORDER_INDEX.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return PLAYER_COLOR_PALETTE.indexOf(a) - PLAYER_COLOR_PALETTE.indexOf(b);
  });
}

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

  return getOrderedLobbyPalette().map((color) => ({
    color,
    name: PLAYER_COLOR_NAME_BY_HEX[color] ?? color,
    disabled: takenByOthers.has(color),
  }));
}
