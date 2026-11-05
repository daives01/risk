import { describe, expect, test } from 'bun:test'
import { eventOfType, playerId } from './fixtures.js'

describe('eventOfType', () => {
  test('rejects missing or differently ordered event kinds', () => {
    expect(() => eventOfType(undefined, 'AttackResolved')).toThrow('received undefined')
    const event = { type: 'GameEnded', winningPlayerId: playerId('winner') } as const
    expect(() => eventOfType(event, 'AttackResolved')).toThrow('received GameEnded')
    expect(eventOfType(event, 'GameEnded')).toBe(event)
  })
})
