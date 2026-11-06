import { describe, expect, test } from 'bun:test'
import { convexTest } from 'convex-test'
import schema from './schema'
import type { TimelinePublicState } from './historyTimeline'
import { api } from './_generated/api'
import { publicGameStateProjection, selectCurrentGameState } from './gameState'
import { readGameState, readPublicGameState, readPublicGameStateNullable } from './typeAdapters'

function publicFixture(): TimelinePublicState {
  return {
    players: { unknown: { status: 'legacy-status', teamId: 'unknown-team' } },
    turnOrder: ['unknown'],
    territories: { unknown: { ownerId: 'unknown', armies: 0 } },
    turn: { currentPlayerId: 'unknown', phase: 'Attack', round: 0 },
    capturedThisTurn: false,
    tradesCompleted: 0,
    deckCount: 0,
    discardCount: 0,
    handSizes: { unknown: 0 },
    stateVersion: 0,
  }
}

function privateFixture() {
  return readGameState({
    ...publicFixture(),
    players: { unknown: { status: 'alive' } },
    deck: { draw: ['secret'], discard: ['discarded'] },
    cardsById: { secret: { kind: 'W' } },
    hands: { unknown: ['secret'] },
    rng: { seed: 'secret', index: 0 },
    rulesetVersion: 1,
  })
}

describe('current public game state boundary', () => {
  test('retains extras, identity, optional presence and all phases without mutation', () => {
    for (const phase of ['Setup', 'Reinforcement', 'Attack', 'Occupy', 'Fortify', 'GameOver']) {
      const source = {
        ...publicFixture(),
        turn: { currentPlayerId: 'unregistered', phase, round: 0 },
        pending: { type: 'Occupy', from: 'missing', to: 'other', minMove: 0, maxMove: 0 },
        reinforcements: { remaining: 0, sources: { unknown: 0 } },
        fortifiesUsedThisTurn: 0,
        extra: { retained: true },
        hands: { untrustedExtra: ['preserved'] },
      }

      const before = structuredClone(source)
      Object.freeze(source)
      expect(Object.is(readPublicGameState(source), source)).toBe(true)
      expect(source).toEqual(before)
    }

    const minimal = {
      ...publicFixture(),
      players: {},
      territories: {},
      handSizes: {},
      turnOrder: [],
    }

    expect(readPublicGameState(minimal)).toBe(minimal)
    expect(Object.prototype.hasOwnProperty.call(readPublicGameState(minimal), 'pending')).toBe(
      false,
    )

    const explicit = {
      ...minimal,
      pending: undefined,
      reinforcements: undefined,
      fortifiesUsedThisTurn: undefined,
    }

    expect(readPublicGameState(explicit)).toBe(explicit)
    expect(Object.prototype.hasOwnProperty.call(readPublicGameState(explicit), 'pending')).toBe(
      true,
    )
    expect(
      readPublicGameState({
        ...minimal,
        reinforcements: { remaining: NaN, sources: undefined },
        deckCount: Infinity,
      }),
    ).toBeDefined()
    expect(readPublicGameStateNullable(null)).toBeNull()
    expect(readPublicGameStateNullable(undefined)).toBeNull()
    expect(readPublicGameStateNullable(minimal)).toBe(minimal)
  })

  test('rejects malformed required fields and nested values including sparse arrays', () => {
    const invalid = [
      null,
      undefined,
      [],
      1,
      'state',
      {},
      ...Object.keys(publicFixture()).map((key) => ({ ...publicFixture(), [key]: undefined })),
      ...[
        { players: [] },
        { players: { p: { status: 1 } } },
        { players: { p: { status: 'legacy', teamId: null } } },
        { turnOrder: [1] },
        { turnOrder: new Array(1) },
        { territories: { t: null } },
        { territories: { t: { ownerId: 1, armies: 0 } } },
        { territories: { t: { ownerId: 'p', armies: '0' } } },
        { turn: { currentPlayerId: 1, phase: 'Attack', round: 0 } },
        { turn: { currentPlayerId: 'p', phase: 'Other', round: 0 } },
        { turn: { currentPlayerId: 'p', phase: 'Attack', round: '0' } },
        { pending: null },
        { pending: { type: 'Other', from: 'a', to: 'b', minMove: 0, maxMove: 0 } },
        ...['from', 'to', 'minMove', 'maxMove'].map((key) => ({
          pending: { type: 'Occupy', from: 'a', to: 'b', minMove: 0, maxMove: 0, [key]: null },
        })),
        { reinforcements: null },
        { reinforcements: { remaining: '0' } },
        { reinforcements: { remaining: 0, sources: { x: '0' } } },
        { capturedThisTurn: 0 },
        { tradesCompleted: '0' },
        { fortifiesUsedThisTurn: null },
        { deckCount: '0' },
        { discardCount: '0' },
        { handSizes: { p: '0' } },
        { stateVersion: '0' },
      ].map((fields) => ({ ...publicFixture(), ...fields })),
    ]

    for (const value of invalid)
      expect(() => readPublicGameState(value)).toThrow('Invalid public game state')
  })

  test('checks private first, prefers checked cache, and falls back only for nullish cache', () => {
    const privateState = privateFixture()
    const publicState = publicFixture()
    expect(selectCurrentGameState({ privateState, publicState })).toEqual({
      privateState,
      publicState,
    })
    expect(selectCurrentGameState({ privateState, publicState }).publicState).toBe(publicState)

    for (const cache of [null, undefined]) {
      expect(selectCurrentGameState({ privateState, publicState: cache }).publicState).toEqual(
        publicGameStateProjection(privateState),
      )
    }

    expect(selectCurrentGameState(null)).toEqual({ privateState: null, publicState: null })
    expect(selectCurrentGameState({ publicState }).publicState).toBe(publicState)
    expect(() => selectCurrentGameState({ privateState, publicState: {} })).toThrow(
      'Invalid public game state',
    )
    expect(() => selectCurrentGameState({ privateState: {}, publicState })).toThrow(
      'Invalid game state',
    )
    expect(() => selectCurrentGameState({ privateState: {}, publicState: {} })).toThrow(
      'Invalid game state',
    )
  })

  test('projection excludes known private root fields and counts cards', () => {
    const projected = publicGameStateProjection(privateFixture())
    expect(projected).toMatchObject({ deckCount: 1, discardCount: 1, handSizes: { unknown: 1 } })

    for (const key of ['hands', 'rng', 'deck', 'cardsById'])
      expect(Object.prototype.hasOwnProperty.call(projected, key)).toBe(false)
  })

  test('spectator query checks cache and bypasses state parsing in a Lobby', async () => {
    const t = convexTest({
      schema,
      modules: {
        './_generated/server.js': () => import('./_generated/server.js'),
        './games.ts': () => import('./games'),
      },
    })

    const gameId = await t.run((ctx) =>
      ctx.db.insert('games', {
        createdBy: 'boundary-user',
        name: 'Boundary',
        mapId: 'unknown',
        status: 'active',
        visibility: 'public',
        timingMode: 'realtime',
        maxPlayers: 2,
        createdAt: 0,
      }),
    )

    expect((await t.query(api.games.getGameView, { gameId }))?.state).toBeNull()

    const stateId = await t.run((ctx) =>
      ctx.db.insert('gameStates', {
        gameId,
        version: 0,
        privateState: privateFixture(),
        publicState: publicFixture(),
        updatedAt: 0,
      }),
    )

    expect((await t.query(api.games.getGameView, { gameId }))?.state).toEqual(publicFixture())
    await t.run((ctx) => ctx.db.patch(stateId, { publicState: null }))
    expect((await t.query(api.games.getGameView, { gameId }))?.state).toEqual(
      publicGameStateProjection(privateFixture()),
    )
    await t.run((ctx) => ctx.db.patch(stateId, { privateState: {}, publicState: publicFixture() }))
    await expect(t.query(api.games.getGameView, { gameId })).rejects.toThrow('Invalid game state')
    await t.run((ctx) => ctx.db.patch(stateId, { privateState: privateFixture(), publicState: {} }))
    await expect(t.query(api.games.getGameView, { gameId })).rejects.toThrow(
      'Invalid public game state',
    )
    await t.run(async (ctx) => {
      await ctx.db.patch(stateId, { privateState: {} })
      await ctx.db.patch(gameId, { status: 'lobby' })
    })
    expect((await t.query(api.games.getGameView, { gameId }))?.state).toBeNull()
  })
})
