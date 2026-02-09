import { PLAYER_COLOR_PALETTE, type PlayerColor } from "risk-engine";

export type PlayerColorInfo = {
  userId: string;
  joinedAt: number;
  color?: string | null;
};

function comparePlayers(a: PlayerColorInfo, b: PlayerColorInfo) {
  if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
  return a.userId.localeCompare(b.userId);
}

export function isPlayerColor(value: string): value is PlayerColor {
  return PLAYER_COLOR_PALETTE.includes(value as PlayerColor);
}

export function canEditPlayerColor(
  callerUserId: string,
  hostUserId: string,
  targetUserId: string,
) {
  return callerUserId === hostUserId || callerUserId === targetUserId;
}

function getSpreadPalette() {
  const spread: PlayerColor[] = [];
  let left = 0;
  let right = PLAYER_COLOR_PALETTE.length - 1;

  while (left <= right) {
    spread.push(PLAYER_COLOR_PALETTE[left]!);
    if (left !== right) {
      spread.push(PLAYER_COLOR_PALETTE[right]!);
    }
    left += 1;
    right -= 1;
  }

  return spread;
}

export function resolvePlayerColors(players: readonly PlayerColorInfo[]) {
  const ordered = [...players].sort(comparePlayers);
  const taken = new Set<PlayerColor>();
  const resolved: Record<string, PlayerColor> = {};
  const spreadPalette = getSpreadPalette();

  for (let index = 0; index < ordered.length; index += 1) {
    const player = ordered[index]!;
    const preferred = player.color && isPlayerColor(player.color) ? player.color : null;

    if (preferred && !taken.has(preferred)) {
      resolved[player.userId] = preferred;
      taken.add(preferred);
      continue;
    }

    const next = spreadPalette.find((color) => !taken.has(color));
    if (next) {
      resolved[player.userId] = next;
      taken.add(next);
      continue;
    }

    // Fallback when players exceed palette size; deterministic but may repeat.
    resolved[player.userId] = spreadPalette[index % spreadPalette.length]!;
  }

  return resolved;
}

export function firstAvailablePlayerColor(players: readonly PlayerColorInfo[]) {
  const resolved = resolvePlayerColors(players);
  const used = new Set(Object.values(resolved));
  return getSpreadPalette().find((color) => !used.has(color)) ?? null;
}
