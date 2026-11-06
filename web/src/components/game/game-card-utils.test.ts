import { describe, expect, test } from 'bun:test'
import { isCardKind, resolveAutoSelectState, sortCardsByKind } from './game-card-utils'

describe('card kind lookup boundaries', () => {
  test('recognizes only the four engine card kinds', () => {
    for (const kind of ['A', 'B', 'C', 'W']) expect(isCardKind(kind)).toBe(true)

    for (const kind of ['', 'a', 'unknown', 'constructor', '__proto__', 'toString']) {
      expect(isCardKind(kind)).toBe(false)
    }
  })

  test('sorts unknown and prototype-like kinds after known cards, stably and without mutation', () => {
    const cards = [
      { cardId: 'constructor', kind: 'constructor' },
      { cardId: 'wild', kind: 'W' },
      { cardId: 'prototype', kind: '__proto__' },
      { cardId: 'infantry', kind: 'A' },
      { cardId: 'stringifier', kind: 'toString' },
      { cardId: 'unknown', kind: '?' },
      { cardId: 'cavalry', kind: 'B' },
    ]

    const before = structuredClone(cards)
    const sorted = sortCardsByKind(cards)
    expect(sorted.map((card) => card.cardId)).toEqual([
      'infantry',
      'cavalry',
      'wild',
      'constructor',
      'prototype',
      'stringifier',
      'unknown',
    ])
    expect(cards).toEqual(before)
    expect(sorted).not.toBe(cards)
    expect(sorted[0]).toBe(cards[3])
  })
})

describe('sortCardsByKind', () => {
  test('groups cards as A, B, C, then W while preserving matching-card order', () => {
    const cards = [
      { cardId: 'c-1', kind: 'C' },
      { cardId: 'a-1', kind: 'A' },
      { cardId: 'w-1', kind: 'W' },
      { cardId: 'b-1', kind: 'B' },
      { cardId: 'a-2', kind: 'A' },
    ]

    expect(sortCardsByKind(cards).map((card) => card.cardId)).toEqual([
      'a-1',
      'a-2',
      'b-1',
      'c-1',
      'w-1',
    ])
    expect(cards[0]?.cardId).toBe('c-1')
  })
})

describe('resolveAutoSelectState', () => {
  test('hides without a valid set, selects an optimal set, then toggles it off', () => {
    expect(resolveAutoSelectState(new Set(['manual']), null)).toEqual({
      visible: false,
      active: false,
      nextSelection: new Set(['manual']),
    })

    const optimal = ['a', 'b', 'c']
    expect(resolveAutoSelectState(new Set(['manual']), optimal)).toEqual({
      visible: true,
      active: false,
      nextSelection: new Set(optimal),
    })
    expect(resolveAutoSelectState(new Set(optimal), optimal)).toEqual({
      visible: true,
      active: true,
      nextSelection: new Set(),
    })
  })
})
