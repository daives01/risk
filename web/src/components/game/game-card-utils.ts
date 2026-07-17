export interface GameCardData {
  cardId: string;
  kind: string;
}

const kindOrder: Record<string, number> = { A: 0, B: 1, C: 2, W: 3 };

export function sortCardsByKind<T extends GameCardData>(cards: readonly T[]): T[] {
  return [...cards].sort((left, right) =>
    (kindOrder[left.kind] ?? Number.MAX_SAFE_INTEGER) -
    (kindOrder[right.kind] ?? Number.MAX_SAFE_INTEGER),
  );
}

export function resolveAutoSelectState(
  currentSelection: ReadonlySet<string>,
  optimalCardIds: readonly string[] | null,
) {
  if (!optimalCardIds) {
    return {
      visible: false,
      active: false,
      nextSelection: new Set(currentSelection),
    };
  }

  const active =
    currentSelection.size === optimalCardIds.length &&
    optimalCardIds.every((cardId) => currentSelection.has(cardId));

  return {
    visible: true,
    active,
    nextSelection: active ? new Set<string>() : new Set(optimalCardIds),
  };
}
