import { describe, expect, test } from 'bun:test'
import { convexTest } from 'convex-test'
import { api } from './_generated/api'
import schema from './schema'
import { redactHistoryAction, redactHistoryEvents } from './historyPayloads'
import { readTimelineStatePatch, readTimelineStatePatchOptional } from './typeAdapters'
import {
  applyTimelineStatePatch,
  type TimelinePublicState,
  type TimelineStatePatch,
} from './historyTimeline'

function snapshot(): TimelinePublicState {
  return {
    players: { p1: { status: 'legacy-status' } },
    turnOrder: ['p1'],
    territories: { a: { ownerId: 'p1', armies: 3 } },
    turn: { currentPlayerId: 'p1', phase: 'Attack', round: 1 },
    capturedThisTurn: true,
    tradesCompleted: 1,
    deckCount: 3,
    discardCount: 2,
    handSizes: { p1: 0 },
    stateVersion: 0,
    pending: { type: 'Occupy', from: 'a', to: 'b', minMove: 0, maxMove: 1 },
    reinforcements: { remaining: 2 },
    fortifiesUsedThisTurn: 1,
  }
}

async function seedHistory() {
  const t = convexTest({
    schema,
    modules: {
      './_generated/server.js': () => import('./_generated/server.js'),
      './gameplay.ts': () => import('./gameplay'),
    },
  })

  const ids = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert('games', {
      name: 'History boundary',
      mapId: 'unused',
      status: 'active',
      visibility: 'unlisted',
      timingMode: 'realtime',
      maxPlayers: 2,
      createdBy: 'user',
      createdAt: 1,
    })

    const snapshotId = await ctx.db.insert('gameStateSnapshots', {
      gameId,
      index: -1,
      publicState: snapshot(),
      createdAt: 1,
    })

    await ctx.db.insert('gameStates', {
      gameId,
      version: 0,
      privateState: 'not a private state',
      publicState: snapshot(),
      updatedAt: 1,
    })

    return { gameId, snapshotId }
  })

  return { t, ...ids }
}

describe('historical public payload boundary', () => {
  test('validates patches while preserving identity, extras, optional presence and delete semantics', () => {
    const patch = {
      players: { p1: { status: 'legacy-status', teamId: 'unregistered' } },
      turnOrder: ['unregistered'],
      territories: { a: { armies: 0 }, b: { ownerId: 'unregistered' }, c: {} },
      turn: { currentPlayerId: 'unregistered', phase: 'Fortify', round: 0 },
      pending: null,
      reinforcements: null,
      capturedThisTurn: false,
      tradesCompleted: 0,
      fortifiesUsedThisTurn: null,
      deckCount: 0,
      discardCount: 0,
      handSizes: { unregistered: 0 },
      stateVersion: 0,
      extra: { retained: true },
    } satisfies TimelineStatePatch & { extra: { retained: boolean } }

    const before = structuredClone(patch)
    expect(readTimelineStatePatch(patch)).toBe(patch)
    expect(patch).toEqual(before)
    const previous = snapshot()
    const previousBefore = structuredClone(previous)
    const next = applyTimelineStatePatch(previous, readTimelineStatePatch(patch))
    expect(next.territories.a).toEqual({ ownerId: 'p1', armies: 0 })
    expect(next.capturedThisTurn).toBe(false)
    expect(next.tradesCompleted).toBe(0)

    for (const field of ['pending', 'reinforcements', 'fortifiesUsedThisTurn']) {
      expect(Object.prototype.hasOwnProperty.call(next, field)).toBe(false)
    }

    expect(previous).toEqual(previousBefore)
    const absent = {}
    const explicit = { stateVersion: undefined }
    expect(readTimelineStatePatch(absent)).toBe(absent)
    expect(
      Object.prototype.hasOwnProperty.call(readTimelineStatePatch(absent), 'stateVersion'),
    ).toBe(false)
    expect(readTimelineStatePatch(explicit)).toBe(explicit)
    expect(
      Object.prototype.hasOwnProperty.call(readTimelineStatePatch(explicit), 'stateVersion'),
    ).toBe(true)
    expect(readTimelineStatePatchOptional(undefined)).toBeUndefined()
    expect(readTimelineStatePatchOptional(null)).toBeNull()
    expect(readTimelineStatePatch({ deckCount: -0.5 }).deckCount).toBe(-0.5)
  })

  test('rejects malformed consumed patch fields and sparse lists', () => {
    const sparse: string[] = []
    sparse.length = 1

    for (const value of [
      null,
      undefined,
      [],
      0,
      false,
      'patch',
      { players: { p1: { status: 1 } } },
      { turnOrder: sparse },
      { territories: { a: null } },
      { territories: { a: { armies: false } } },
      { territories: { a: { ownerId: 1 } } },
      { turn: { ...snapshot().turn, phase: 'invalid' } },
      { pending: { type: 'other' } },
      { reinforcements: { remaining: false } },
      { capturedThisTurn: 0 },
      { tradesCompleted: null },
      { fortifiesUsedThisTurn: false },
      { deckCount: '0' },
      { discardCount: null },
      { handSizes: { p1: false } },
      { stateVersion: false },
    ]) {
      expect(() => readTimelineStatePatch(value)).toThrow('Invalid public state patch')
    }
  })

  test('redacts private card fields with exactly the existing shapes and legacy count fallback', () => {
    const events = redactHistoryEvents([
      { type: 'CardDrawn', playerId: 'p1', cardId: 'secret', extra: true },
      {
        type: 'CardsTraded',
        playerId: 'p1',
        cardIds: ['secret'],
        value: 0,
        tradesCompletedAfter: 0,
      },
      { type: 'PlayerEliminated', eliminatedId: 'p2', byId: 'p1', cardsTransferred: ['a', 'b'] },
      { type: 'PlayerEliminated', cardsTransferredCount: 9 },
    ])

    expect(events).toEqual([
      { type: 'CardDrawn', playerId: 'p1' },
      { type: 'CardsTraded', playerId: 'p1', value: 0, tradesCompletedAfter: 0 },
      { type: 'PlayerEliminated', eliminatedId: 'p2', byId: 'p1', cardsTransferredCount: 2 },
      {
        type: 'PlayerEliminated',
        eliminatedId: undefined,
        byId: undefined,
        cardsTransferredCount: 0,
      },
    ])
    expect(Object.prototype.hasOwnProperty.call(events[0], 'cardId')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(events[1], 'cardIds')).toBe(false)
    expect(redactHistoryAction({ type: 'TradeCards', cardIds: ['secret'], extra: true })).toEqual({
      type: 'TradeCards',
    })
  })

  test('keeps unknown record variants and fields without pretending they are engine events', () => {
    for (const value of [{}, { type: 0, extra: false }, { type: 'FutureEvent', nested: [0] }]) {
      expect(redactHistoryEvents([value])[0]).toBe(value)
      expect(redactHistoryAction(value)).toBe(value)
    }

    for (const value of [null, undefined, 1, false, 'event', []]) {
      expect(() => redactHistoryAction(value)).toThrow('Invalid history record')
      expect(() => redactHistoryEvents([value])).toThrow('Invalid history record')
    }

    for (const value of [null, undefined, {}, false])
      expect(() => redactHistoryEvents(value)).toThrow('Invalid history events')
    const sparse: unknown[] = []
    sparse.length = 1
    expect(() => redactHistoryEvents(sparse)).toThrow('Invalid history record')
  })

  test('all query snapshot branches check public state without reading private state', async () => {
    const { t, gameId, snapshotId } = await seedHistory()

    for (const args of [{ gameId }, { gameId, beforeIndex: 0 }]) {
      expect((await t.query(api.gameplay.getHistoryWindow, args)).snapshotPublicState).toEqual(
        snapshot(),
      )
    }

    const actionId = await t.run((ctx) =>
      ctx.db.insert('gameActions', {
        gameId,
        index: 0,
        playerId: 'p1',
        action: { type: 'FutureAction' },
        events: [],
        createdAt: 1,
      }),
    )

    expect((await t.query(api.gameplay.getHistoryWindow, { gameId })).snapshotPublicState).toEqual(
      snapshot(),
    )
    await t.run((ctx) => ctx.db.patch(snapshotId, { publicState: { broken: true } }))

    for (const args of [{ gameId }, { gameId, beforeIndex: 0 }]) {
      await expect(t.query(api.gameplay.getHistoryWindow, args)).rejects.toThrow(
        'Invalid public game state',
      )
    }

    await t.run((ctx) => ctx.db.delete(actionId))
    await expect(t.query(api.gameplay.getHistoryWindow, { gameId })).rejects.toThrow(
      'Invalid public game state',
    )
  })

  test('query checks records and patches, preserving missing versus null patch values', async () => {
    const { t, gameId } = await seedHistory()

    const actionId = await t.run((ctx) =>
      ctx.db.insert('gameActions', {
        gameId,
        index: 0,
        playerId: 'p1',
        action: { type: 'TradeCards', cardIds: ['secret'] },
        events: [{ type: 'CardDrawn', playerId: 'p1', cardId: 'secret' }],
        createdAt: 1,
      }),
    )

    const first = await t.query(api.gameplay.getHistoryWindow, { gameId })
    expect(first.actions[0]?.publicStatePatch).toBeUndefined()
    expect(first.actions[0]?.action).toEqual({ type: 'TradeCards' })
    expect(first.actions[0]?.events).toEqual([{ type: 'CardDrawn', playerId: 'p1' }])
    await t.run((ctx) => ctx.db.patch(actionId, { publicStatePatch: null }))
    expect(
      (await t.query(api.gameplay.getHistoryWindow, { gameId })).actions[0]?.publicStatePatch,
    ).toBeNull()
    await t.run((ctx) =>
      ctx.db.patch(actionId, { publicStatePatch: { capturedThisTurn: false, stateVersion: 0 } }),
    )
    expect(
      (await t.query(api.gameplay.getHistoryWindow, { gameId })).actions[0]?.publicStatePatch,
    ).toEqual({ capturedThisTurn: false, stateVersion: 0 })

    for (const patch of [
      { publicStatePatch: { handSizes: { p1: 'bad' } } },
      { publicStatePatch: {}, events: [null] },
      { events: [], action: [] },
    ]) {
      await t.run((ctx) => ctx.db.patch(actionId, patch))
      await expect(t.query(api.gameplay.getHistoryWindow, { gameId })).rejects.toThrow('Invalid')
    }
  })
})
