import type { PlayerId } from "risk-engine";

interface ShuffleLike {
  shuffle<T>(arr: readonly T[]): T[];
}

export function createTeamAwareTurnOrder(
  playerIds: readonly PlayerId[],
  playerTeamIds: Record<string, string | undefined>,
  rng: ShuffleLike,
): PlayerId[] {
  if (playerIds.length <= 1) {
    return [...playerIds];
  }

  const teamBuckets = new Map<string, PlayerId[]>();
  for (const playerId of playerIds) {
    const teamId = playerTeamIds[playerId] ?? `solo:${playerId}`;
    const bucket = teamBuckets.get(teamId);
    if (bucket) {
      bucket.push(playerId);
    } else {
      teamBuckets.set(teamId, [playerId]);
    }
  }

  if (teamBuckets.size <= 1) {
    return rng.shuffle([...playerIds]);
  }

  const shuffledTeamIds = rng.shuffle([...teamBuckets.keys()]);
  const shuffledBuckets = new Map<string, PlayerId[]>();
  let maxBucketSize = 0;

  for (const teamId of shuffledTeamIds) {
    const shuffledPlayers = rng.shuffle([...(teamBuckets.get(teamId) ?? [])]);
    maxBucketSize = Math.max(maxBucketSize, shuffledPlayers.length);
    shuffledBuckets.set(teamId, shuffledPlayers);
  }

  const turnOrder: PlayerId[] = [];
  for (let slot = 0; slot < maxBucketSize; slot += 1) {
    for (const teamId of shuffledTeamIds) {
      const teamPlayers = shuffledBuckets.get(teamId);
      if (!teamPlayers || slot >= teamPlayers.length) continue;
      turnOrder.push(teamPlayers[slot]!);
    }
  }

  return turnOrder;
}
