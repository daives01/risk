import type { PlayerId, TerritoryId, CardId, TeamId, ContinentId, GameEvent } from '../types.js'

export function playerId(value: string): PlayerId {
  // SAFETY: Test fixtures label this synthetic string as a PlayerId; no membership or external-input validation is claimed.
  return value as PlayerId
}

export function territoryId(value: string): TerritoryId {
  // SAFETY: Test fixtures label this synthetic string as a TerritoryId; no membership or external-input validation is claimed.
  return value as TerritoryId
}

export function cardId(value: string): CardId {
  // SAFETY: Test fixtures label this synthetic string as a CardId; no membership or external-input validation is claimed.
  return value as CardId
}

export function teamId(value: string): TeamId {
  // SAFETY: Test fixtures label this synthetic string as a TeamId; no membership or external-input validation is claimed.
  return value as TeamId
}

export function continentId(value: string): ContinentId {
  // SAFETY: Test fixtures label this synthetic string as a ContinentId; no membership or external-input validation is claimed.
  return value as ContinentId
}

export function eventOfType<T extends GameEvent['type']>(
  event: GameEvent | undefined,
  type: T,
): Extract<GameEvent, { type: T }> {
  const matchesType = (
    candidate: GameEvent | undefined,
  ): candidate is Extract<GameEvent, { type: T }> => candidate?.type === type

  if (!matchesType(event))
    throw new Error(`Expected ${type} event, received ${event?.type ?? 'undefined'}`)

  return event
}
