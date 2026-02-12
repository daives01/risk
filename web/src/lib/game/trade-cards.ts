export type TradeSetsConfig = {
  allowThreeOfAKind: boolean;
  allowOneOfEach: boolean;
  wildActsAsAny: boolean;
};

export function isValidTradeSet(kinds: readonly string[], tradeSets: TradeSetsConfig): boolean {
  if (kinds.length !== 3) return false;

  const nonWildKinds = kinds.filter((kind) => kind !== "W");
  const wildCount = kinds.length - nonWildKinds.length;

  if (!tradeSets.wildActsAsAny && wildCount > 0) return false;

  if (tradeSets.allowThreeOfAKind) {
    const uniqueNonWild = new Set(nonWildKinds);
    if (uniqueNonWild.size <= 1) return true;
  }

  if (tradeSets.allowOneOfEach) {
    const uniqueNonWild = new Set(nonWildKinds);
    if (uniqueNonWild.size + wildCount >= 3 && uniqueNonWild.size === nonWildKinds.length) {
      return true;
    }
  }

  return false;
}

export function findAutoTradeSet(
  hand: Array<{ cardId: string; kind: string }>,
  tradeSets: TradeSetsConfig,
): string[] | null {
  let bestSelection: string[] | null = null;
  let bestWildCount = Number.POSITIVE_INFINITY;
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        const selected = [hand[i]!, hand[j]!, hand[k]!];
        if (isValidTradeSet(selected.map((card) => card.kind), tradeSets)) {
          const wildCount = selected.filter((card) => card.kind === "W").length;
          if (wildCount < bestWildCount) {
            bestSelection = selected.map((card) => card.cardId);
            bestWildCount = wildCount;
          }
          if (bestWildCount === 0) {
            return bestSelection;
          }
        }
      }
    }
  }
  return bestSelection;
}
