import type { CardKind } from 'risk-engine'

export interface GameCardData {
  cardId: string
  kind: string
}

const kindOrder = { A: 0, B: 1, C: 2, W: 3 } satisfies Record<CardKind, number>

export function isCardKind(kind: string): kind is CardKind {
  return kind === 'A' || kind === 'B' || kind === 'C' || kind === 'W'
}

export function sortCardsByKind<T extends GameCardData>(cards: readonly T[]): T[] {
  return [...cards].sort((left, right) => {
    const leftOrder = isCardKind(left.kind) ? kindOrder[left.kind] : Number.MAX_SAFE_INTEGER
    const rightOrder = isCardKind(right.kind) ? kindOrder[right.kind] : Number.MAX_SAFE_INTEGER

    return leftOrder - rightOrder
  })
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
    }
  }

  const active =
    currentSelection.size === optimalCardIds.length &&
    optimalCardIds.every((cardId) => currentSelection.has(cardId))

  return {
    visible: true,
    active,
    nextSelection: active ? new Set<string>() : new Set(optimalCardIds),
  }
}
