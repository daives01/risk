/** Raw per-game die-face counts for one Engine Player, split by combat role. */
export interface DieFaceCounts {
  ones: number;
  twos: number;
  threes: number;
  fours: number;
  fives: number;
  sixes: number;
}

export interface DiceRollCounts {
  attack: DieFaceCounts;
  defense: DieFaceCounts;
}

const FACE_KEYS = ["ones", "twos", "threes", "fours", "fives", "sixes"] as const;

export function createEmptyDieFaceCounts(): DieFaceCounts {
  return { ones: 0, twos: 0, threes: 0, fours: 0, fives: 0, sixes: 0 };
}

export function createEmptyDiceRollCounts(): DiceRollCounts {
  return { attack: createEmptyDieFaceCounts(), defense: createEmptyDieFaceCounts() };
}

export function addRollsToFaceCounts(counts: DieFaceCounts, rolls: readonly number[]): DieFaceCounts {
  const next = { ...counts };
  for (const roll of rolls) {
    if (!Number.isInteger(roll) || roll < 1 || roll > 6) {
      throw new Error(`Invalid six-sided die roll: ${roll}`);
    }
    const key = FACE_KEYS[roll - 1]!;
    next[key] += 1;
  }
  return next;
}

export function combineDieFaceCounts(left: DieFaceCounts, right: DieFaceCounts): DieFaceCounts {
  return {
    ones: left.ones + right.ones,
    twos: left.twos + right.twos,
    threes: left.threes + right.threes,
    fours: left.fours + right.fours,
    fives: left.fives + right.fives,
    sixes: left.sixes + right.sixes,
  };
}

export function summarizeDieFaceCounts(counts: DieFaceCounts) {
  const values = FACE_KEYS.map((key) => counts[key]);
  const diceCount = values.reduce((sum, count) => sum + count, 0);
  const rollSum = values.reduce((sum, count, index) => sum + count * (index + 1), 0);
  const average = diceCount === 0 ? null : rollSum / diceCount;
  return {
    diceCount,
    rollSum,
    average,
    deviationFromExpected: average === null ? null : average - 3.5,
  };
}
