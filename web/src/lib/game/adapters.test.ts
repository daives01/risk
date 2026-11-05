import { expect, test } from 'bun:test'
import { convexTest } from 'convex-test'
import { api } from '../../../../convex/_generated/api'
import schema from '../../../../convex/schema'
import { adaptMapDoc, adaptView } from './adapters'

function testBackend() {
  return convexTest({
    schema,
    modules: {
      './_generated/server.js': () => import('../../../../convex/_generated/server'),
      './games.ts': () => import('../../../../convex/games'),
      './maps.ts': () => import('../../../../convex/maps'),
    },
  })
}

test('view defaults and player preference preserve private hands', async () => {
  expect(adaptView(undefined, null)).toEqual({
    view: null,
    state: null,
    playerMap: [],
    myEnginePlayerId: null,
    myHand: null,
    teammateHands: null,
    delegatableTurnHand: null,
  })
  const t = testBackend()

  const gameId = await t.run((ctx) =>
    ctx.db.insert('games', {
      name: 'Adapter fixture',
      mapId: 'fixture',
      status: 'lobby',
      visibility: 'public',
      timingMode: 'realtime',
      maxPlayers: 2,
      createdBy: 'fixture',
      createdAt: 0,
    }),
  )

  const publicView = await t.query(api.games.getGameView, { gameId })

  if (!publicView) throw new Error('Missing public fixture view')
  const myHand = [{ cardId: 'card', kind: 'A' }]
  const teammateHands = { teammate: [{ cardId: 'team-card', kind: 'W' }] }

  const playerView = {
    ...publicView,
    name: 'Player view',
    status: 'active' as const,
    myEnginePlayerId: 'player',
    myHand,
    teammateHands,
    delegatableTurnHand: myHand,
  }

  const result = adaptView(playerView, publicView)

  expect(result.view).toBe(playerView)
  expect(result.myHand).toBe(myHand)
  expect(result.teammateHands).toBe(teammateHands)
  expect(result.delegatableTurnHand).toBe(myHand)
  expect(adaptView(null, publicView).view).toBe(publicView)
  expect(adaptView(undefined, publicView).myHand).toBeNull()
})

test('map adaptation checks graph data and normalizes node scale', async () => {
  expect(adaptMapDoc(null)).toEqual({
    graphMap: undefined,
    mapVisual: undefined,
    mapImageUrl: null,
  })
  const t = testBackend()
  await t.run(async (ctx) => {
    const imageStorageId = await ctx.storage.store(new Blob(['fixture']))

    await ctx.db.insert('maps', {
      mapId: 'fixture',
      name: 'Fixture',
      createdAt: 0,
      graphMap: { territories: { a: {} }, adjacency: { a: [] } },
      visual: {
        imageStorageId,
        imageWidth: 100,
        imageHeight: 50,
        territoryAnchors: {},
        nodeScale: 2,
      },
      authoring: { status: 'published', updatedAt: 0 },
    })
  })
  const mapDoc = await t.query(api.maps.getByMapId, { mapId: 'fixture' })

  if (!mapDoc) throw new Error('Missing map fixture')
  expect(Object.is(adaptMapDoc(mapDoc).graphMap, mapDoc.graphMap)).toBe(true)
  expect(adaptMapDoc(mapDoc).mapVisual?.nodeScale).toBe(2)

  for (const nodeScale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(
      adaptMapDoc({ ...mapDoc, visual: { ...mapDoc.visual, nodeScale } }).mapVisual?.nodeScale,
    ).toBe(1)
  }

  const malformedNeighbors = ['a']

  delete malformedNeighbors[0]
  expect(() =>
    adaptMapDoc({
      ...mapDoc,
      graphMap: { ...mapDoc.graphMap, adjacency: { a: malformedNeighbors } },
    }),
  ).toThrow('Invalid map data')
})
