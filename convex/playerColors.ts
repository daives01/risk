import { PLAYER_COLOR_PALETTE, type PlayerColor } from "risk-engine";

export type PlayerColorInfo = {
  userId: string;
  joinedAt: number;
  color?: string | null;
};

function toLab(color: PlayerColor) {
  const r8 = parseInt(color.slice(1, 3), 16);
  const g8 = parseInt(color.slice(3, 5), 16);
  const b8 = parseInt(color.slice(5, 7), 16);

  const toLinear = (value: number) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  const r = toLinear(r8);
  const g = toLinear(g8);
  const b = toLinear(b8);

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;

  const f = (value: number) => (
    value > 0.008856451679035631
      ? Math.cbrt(value)
      : (7.787037037037037 * value) + (16 / 116)
  );

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    l: (116 * fy) - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function colorDistance(a: PlayerColor, b: PlayerColor) {
  const al = toLab(a);
  const bl = toLab(b);
  return Math.hypot(al.l - bl.l, al.a - bl.a, al.b - bl.b);
}

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

function chooseAnchorColors(teamCount: number) {
  const palette = PLAYER_COLOR_PALETTE;
  const indices = Array.from({ length: palette.length }, (_, index) => index);
  let bestChosen: number[] = indices.slice(0, teamCount);
  let bestMinDistance = Number.NEGATIVE_INFINITY;
  let bestAvgDistance = Number.NEGATIVE_INFINITY;

  const distanceByPair = new Map<string, number>();
  const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const getDistance = (a: number, b: number) => {
    const key = pairKey(a, b);
    const cached = distanceByPair.get(key);
    if (cached !== undefined) return cached;
    const value = colorDistance(palette[a]!, palette[b]!);
    distanceByPair.set(key, value);
    return value;
  };

  const walk = (start: number, remaining: number, chosen: number[]) => {
    if (remaining === 0) {
      let minDistance = Number.POSITIVE_INFINITY;
      let sumDistance = 0;
      let pairCount = 0;
      for (let i = 0; i < chosen.length; i += 1) {
        for (let j = i + 1; j < chosen.length; j += 1) {
          const d = getDistance(chosen[i]!, chosen[j]!);
          minDistance = Math.min(minDistance, d);
          sumDistance += d;
          pairCount += 1;
        }
      }
      const avgDistance = pairCount > 0 ? sumDistance / pairCount : 0;
      if (
        minDistance > bestMinDistance
        || (minDistance === bestMinDistance && avgDistance > bestAvgDistance)
      ) {
        bestChosen = [...chosen];
        bestMinDistance = minDistance;
        bestAvgDistance = avgDistance;
      }
      return;
    }

    for (let index = start; index <= indices.length - remaining; index += 1) {
      chosen.push(indices[index]!);
      walk(index + 1, remaining - 1, chosen);
      chosen.pop();
    }
  };

  walk(0, teamCount, []);

  const anchors = bestChosen
    .map((index: number) => palette[index]!)
    .sort((a: PlayerColor, b: PlayerColor) => palette.indexOf(a) - palette.indexOf(b));

  return anchors;
}

export function resolveTeamAwarePlayerColors(
  players: readonly PlayerColorInfo[],
  teamIdByUserId: Readonly<Record<string, string | undefined>>,
) {
  const orderedPlayers = [...players].sort(comparePlayers);
  if (orderedPlayers.length === 0) return {};

  const teamIds = Array.from(
    new Set(
      orderedPlayers
        .map((player) => teamIdByUserId[player.userId])
        .filter((teamId): teamId is string => Boolean(teamId)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  if (teamIds.length < 2) {
    return resolvePlayerColors(players);
  }

  const teamSizeById = Object.fromEntries(teamIds.map((teamId) => [teamId, 0]));
  for (const player of orderedPlayers) {
    const teamId = teamIdByUserId[player.userId];
    if (!teamId || !(teamId in teamSizeById)) continue;
    teamSizeById[teamId] += 1;
  }

  const sizedTeamIds = teamIds.filter((teamId) => teamSizeById[teamId] > 0);
  if (sizedTeamIds.length < 2) {
    return resolvePlayerColors(players);
  }

  const anchors = chooseAnchorColors(sizedTeamIds.length);
  const anchorsByTeamId = Object.fromEntries(
    sizedTeamIds.map((teamId, index) => [teamId, anchors[index]!]),
  ) as Record<string, PlayerColor>;

  const unassigned = new Set<PlayerColor>(PLAYER_COLOR_PALETTE);
  const teamColorsById: Record<string, PlayerColor[]> = {};
  for (const teamId of sizedTeamIds) {
    const anchor = anchorsByTeamId[teamId]!;
    teamColorsById[teamId] = [anchor];
    unassigned.delete(anchor);
  }

  const teamNeedById = Object.fromEntries(
    sizedTeamIds.map((teamId) => [teamId, Math.max(0, teamSizeById[teamId] - 1)]),
  );

  const remainingByDistance = [...unassigned].sort((a, b) => {
    let bestA = Number.POSITIVE_INFINITY;
    let bestB = Number.POSITIVE_INFINITY;
    for (const teamId of sizedTeamIds) {
      bestA = Math.min(bestA, colorDistance(a, anchorsByTeamId[teamId]!));
      bestB = Math.min(bestB, colorDistance(b, anchorsByTeamId[teamId]!));
    }
    if (bestA !== bestB) return bestA - bestB;
    return PLAYER_COLOR_PALETTE.indexOf(a) - PLAYER_COLOR_PALETTE.indexOf(b);
  });

  for (const color of remainingByDistance) {
    let bestTeam: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const teamId of sizedTeamIds) {
      if ((teamNeedById[teamId] ?? 0) <= 0) continue;
      const d = colorDistance(color, anchorsByTeamId[teamId]!);
      if (d < bestDistance) {
        bestDistance = d;
        bestTeam = teamId;
      }
    }

    if (!bestTeam) {
      break;
    }
    teamColorsById[bestTeam]!.push(color);
    teamNeedById[bestTeam] -= 1;
  }

  for (const teamId of sizedTeamIds) {
    const anchor = anchorsByTeamId[teamId]!;
    teamColorsById[teamId]!.sort((a, b) => {
      if (a === anchor) return -1;
      if (b === anchor) return 1;
      const da = colorDistance(a, anchor);
      const db = colorDistance(b, anchor);
      if (da !== db) return da - db;
      return PLAYER_COLOR_PALETTE.indexOf(a) - PLAYER_COLOR_PALETTE.indexOf(b);
    });
  }

  const resolved: Record<string, PlayerColor> = {};
  const fallback = resolvePlayerColors(players);
  const playersByTeamId: Record<string, PlayerColorInfo[]> = Object.fromEntries(
    sizedTeamIds.map((teamId) => [teamId, []]),
  );

  for (const player of orderedPlayers) {
    const teamId = teamIdByUserId[player.userId];
    if (teamId && playersByTeamId[teamId]) {
      playersByTeamId[teamId]!.push(player);
      continue;
    }
    resolved[player.userId] = fallback[player.userId]!;
  }

  const used = new Set<PlayerColor>(Object.values(resolved));
  for (const teamId of sizedTeamIds) {
    const playersInTeam = playersByTeamId[teamId]!;
    const preferredColors = teamColorsById[teamId]!;
    let colorIndex = 0;
    for (const player of playersInTeam) {
      while (colorIndex < preferredColors.length && used.has(preferredColors[colorIndex]!)) {
        colorIndex += 1;
      }
      const next = preferredColors[colorIndex] ?? [...PLAYER_COLOR_PALETTE].find((color) => !used.has(color));
      if (!next) {
        resolved[player.userId] = fallback[player.userId]!;
      } else {
        resolved[player.userId] = next;
        used.add(next);
      }
      colorIndex += 1;
    }
  }

  return resolved;
}

export function firstAvailablePlayerColor(players: readonly PlayerColorInfo[]) {
  const resolved = resolvePlayerColors(players);
  const used = new Set(Object.values(resolved));
  return getSpreadPalette().find((color) => !used.has(color)) ?? null;
}
