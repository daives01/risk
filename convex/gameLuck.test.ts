import { describe, expect, test } from 'bun:test'
import { convexTest } from 'convex-test'
import type { CombatLuckStats, DiceRollCounts } from 'risk-engine'
import { internal } from './_generated/api'
import { accumulateFrameGameLuck } from './gameLuck'
import schema from './schema'

function combatEvent() {
  return {
    type: 'AttackResolved',
    to: 'target',
    attackRolls: [6],
    defendRolls: [1],
    attackDice: 1,
    defendDice: 1,
    attackerLosses: 0,
    defenderLosses: 1,
  }
}

function accumulate(events: readonly unknown[], ownerId = 'defender') {
  const countsByPlayerId = new Map<string, DiceRollCounts>()
  const combatByPlayerId = new Map<string, CombatLuckStats>()
  accumulateFrameGameLuck({
    countsByPlayerId,
    combatByPlayerId,
    attackerId: 'attacker',
    beforeState: { territories: { target: { ownerId, armies: 1 } } },
    events,
    actionIndex: 7,
  })

  return { countsByPlayerId, combatByPlayerId }
}

describe('Game luck public combat events', () => {
  test('attributes a minimal consumed event without private engine fields', () => {
    const { countsByPlayerId, combatByPlayerId } = accumulate([combatEvent()])
    expect(countsByPlayerId.get('attacker')?.attack.sixes).toBe(1)
    expect(countsByPlayerId.get('defender')?.defense.ones).toBe(1)
    expect(combatByPlayerId.get('attacker')?.attack).toMatchObject({
      battles: 1,
      actualOwnLosses: 0,
      actualEnemyLosses: 1,
    })
    expect(combatByPlayerId.get('defender')?.defense).toMatchObject({
      battles: 1,
      actualOwnLosses: 1,
      actualEnemyLosses: 0,
    })
  })

  test('ignores unrelated unknown events', () => {
    const result = accumulate([null, 2, [], {}, { type: 'Other', attackRolls: false }])
    expect(result.countsByPlayerId.size).toBe(0)
    expect(result.combatByPlayerId.size).toBe(0)
  })

  test.each([
    { to: 1 },
    { attackRolls: null },
    { attackRolls: ['6'] },
    { attackRolls: Array.from({ length: 1 }) },
    { defendRolls: [false] },
    { attackDice: '1' },
    { defendDice: undefined },
    { attackerLosses: null },
    { defenderLosses: '0' },
  ])('explicitly rejects malformed consumed fields %#', (invalid) => {
    expect(() => accumulate([{ ...combatEvent(), ...invalid }])).toThrow(
      'Invalid AttackResolved event',
    )
  })

  test('retains existing helper rules and permits numeric zero losses and empty rolls', () => {
    const event = { ...combatEvent(), attackRolls: [], defendRolls: [], defenderLosses: 0 }
    expect(accumulate([event]).combatByPlayerId.get('attacker')?.attack.actualEnemyLosses).toBe(0)
    expect(() => accumulate([{ ...event, attackDice: 0 }])).toThrow(
      'Combat dice counts must be positive integers',
    )
    expect(() => accumulate([{ ...event, attackRolls: [7] }])).toThrow('Invalid six-sided die roll')
    expect(() => accumulate([{ ...event, attackRolls: [1.5] }])).toThrow(
      'Invalid six-sided die roll',
    )
  })

  test('retains missing defender attribution with action context', () => {
    expect(() => accumulate([combatEvent()], '')).toThrow(
      'Cannot attribute defending rolls at action 7: territory target has no owner',
    )
  })
})

async function backfillFixture(publicState?: unknown, patch?: unknown, events: unknown[] = []) {
  const t = convexTest({
    schema,
    modules: {
      './_generated/server.js': () => import('./_generated/server.js'),
      './gameLuck.ts': () => import('./gameLuck'),
    },
  })

  const gameId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('games', {
      name: 'Historical game',
      mapId: 'map',
      status: 'active',
      visibility: 'unlisted',
      timingMode: 'realtime',
      maxPlayers: 2,
      createdBy: 'user',
      createdAt: 1,
    })

    if (publicState !== undefined)
      await ctx.db.insert('gameStateSnapshots', {
        gameId: id,
        index: -1,
        publicState,
        createdAt: 1,
      })
    await ctx.db.insert('gameActions', {
      gameId: id,
      index: 0,
      playerId: 'attacker',
      action: {},
      events,
      publicStatePatch: patch,
      createdAt: 2,
    })

    return id
  })

  return () => t.mutation(internal.gameLuck.backfillGame, { gameId })
}

function publicState() {
  return {
    players: {},
    turnOrder: [],
    territories: { target: { ownerId: 'defender', armies: 1 } },
    turn: { currentPlayerId: 'attacker', phase: 'Attack', round: 0 },
    tradesCompleted: 0,
    capturedThisTurn: false,
    fortifiesUsedThisTurn: 0,
    stateVersion: 0,
    deckCount: 0,
    discardCount: 0,
    handSizes: {},
  }
}

describe('Game luck historical boundaries', () => {
  test('preserves the missing snapshot error', async () => {
    const run = await backfillFixture()
    await expect(run()).rejects.toThrow('initial game-state snapshot is missing')
  })
  test('rejects invalid snapshots', async () => {
    const run = await backfillFixture({ territories: {} })
    await expect(run()).rejects.toThrow('Invalid public game state')
  })
  test.each([undefined, null, false, 0])(
    'preserves missing/falsy patch error %#',
    async (patch) => {
      const run = await backfillFixture(publicState(), patch)
      await expect(run()).rejects.toThrow('action 0 has no public state patch')
    },
  )
  test('rejects malformed patches after accumulating frame events', async () => {
    const run = await backfillFixture(publicState(), { territories: false })
    await expect(run()).rejects.toThrow('Invalid public state patch')

    const malformedEvent = await backfillFixture(publicState(), undefined, [
      { type: 'AttackResolved' },
    ])

    await expect(malformedEvent()).rejects.toThrow('Invalid AttackResolved event')
  })
  test('replays public-only history with zero versions and empty patches', async () => {
    const run = await backfillFixture(publicState(), {})
    await expect(run()).resolves.toEqual({
      actionIndex: 0,
      playersUpdated: 0,
      attackDice: 0,
      defenseDice: 0,
      battles: 0,
    })
  })
})
