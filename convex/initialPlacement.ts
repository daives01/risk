import type { Rng, TerritoryId } from "risk-engine";

type TerritoryState = { armies: number };

export function distributeInitialArmiesCappedRandom(
  rng: Rng,
  owned: TerritoryId[],
  territories: Record<string, TerritoryState>,
  initialArmies: number,
  cap: number,
) {
  if (owned.length === 0) return;

  let remaining = Math.max(0, initialArmies - owned.length);
  const minCap = Math.ceil(initialArmies / owned.length);
  const effectiveCap = Math.max(cap, minCap);

  const eligible = [...owned];
  while (remaining > 0 && eligible.length > 0) {
    const idx = rng.nextInt(0, eligible.length - 1);
    const tid = eligible[idx]!;
    const territory = territories[tid]!;
    if (territory.armies < effectiveCap) {
      territory.armies += 1;
      remaining -= 1;
    }

    if (territory.armies >= effectiveCap) {
      eligible[idx] = eligible[eligible.length - 1]!;
      eligible.pop();
    }
  }
}
