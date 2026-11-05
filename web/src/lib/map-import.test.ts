import { describe, expect, test } from 'bun:test'
import { buildMapExportJson, buildMapImportPrompt, parseMapImportJson } from './map-import'

describe('parseMapImportJson', () => {
  test('parses a valid payload', () => {
    const input = JSON.stringify({
      territories: [
        { id: 'alpha', name: 'Alpha', x: 0.2, y: 0.3 },
        { id: 'beta', name: 'Beta', x: 0.7, y: 0.5 },
      ],
      adjacency: {
        alpha: ['beta'],
        beta: ['alpha'],
      },
      continents: [
        {
          id: 'center',
          bonus: 2,
          territoryIds: ['alpha', 'beta'],
        },
      ],
      playerLimits: {
        minPlayers: 2,
        maxPlayers: 5,
      },
    })

    const result = parseMapImportJson(input)

    expect(result.errors).toEqual([])
    expect(result.value).not.toBeNull()
    expect(result.value?.graphMap.territories).toEqual({
      alpha: { name: 'Alpha' },
      beta: { name: 'Beta' },
    })
    expect(result.value?.graphMap.adjacency).toEqual({
      alpha: ['beta'],
      beta: ['alpha'],
    })
    expect(result.value?.graphMap.continents).toEqual({
      center: { bonus: 2, territoryIds: ['alpha', 'beta'] },
    })
    expect(result.value?.anchors).toEqual({
      alpha: { x: 0.2, y: 0.3 },
      beta: { x: 0.7, y: 0.5 },
    })
    expect(result.value?.playerLimits).toEqual({ minPlayers: 2, maxPlayers: 5 })
  })

  test('returns actionable validation errors', () => {
    const input = JSON.stringify({
      territories: [{ id: 'alpha' }, { id: 'beta' }],
      adjacency: {
        alpha: ['beta', 'beta'],
        beta: [],
      },
      continents: [{ id: 'broken', bonus: 0, territoryIds: ['alpha', 'missing'] }],
      playerLimits: {
        minPlayers: 1,
        maxPlayers: 0,
      },
    })

    const result = parseMapImportJson(input)

    expect(result.value).toBeNull()
    expect(result.errors).toContain('adjacency.alpha.1 duplicates neighbor "beta"')
    expect(result.errors).toContain('adjacency is asymmetric between "alpha" and "beta"')
    expect(result.errors).toContain('continents.0.bonus must be a positive integer')
    expect(result.errors).toContain(
      'continents.0.territoryIds.1 references unknown territory "missing"',
    )
    expect(result.errors).toContain('Territory "beta" is not assigned to any continent')
    expect(result.errors).toContain('playerLimits.minPlayers must be >= 2')
    expect(result.errors).toContain('playerLimits.maxPlayers must be >= playerLimits.minPlayers')
  })

  test('allows a territory to belong to multiple continents', () => {
    const input = JSON.stringify({
      territories: [{ id: 'alpha' }, { id: 'beta' }],
      adjacency: {
        alpha: ['beta'],
        beta: ['alpha'],
      },
      continents: [
        { id: 'north', bonus: 2, territoryIds: ['alpha', 'beta'] },
        { id: 'ring', bonus: 1, territoryIds: ['alpha'] },
      ],
    })

    const result = parseMapImportJson(input)

    expect(result.errors).toEqual([])
    expect(result.value).not.toBeNull()
    expect(result.value?.graphMap.continents).toEqual({
      north: { bonus: 2, territoryIds: ['alpha', 'beta'] },
      ring: { bonus: 1, territoryIds: ['alpha'] },
    })
  })
})

describe('buildMapImportPrompt', () => {
  test('includes schema and constraints for LLM seeding', () => {
    const prompt = buildMapImportPrompt()

    expect(prompt).toContain('"territories"')
    expect(prompt).toContain('"adjacency"')
    expect(prompt).toContain('adjacency must be symmetric')
    expect(prompt).toContain('Every territory must be assigned to at least one continent')
    expect(prompt).toContain('Example JSON')
  })
})

describe('buildMapExportJson', () => {
  test('preserves deterministic territory field order, zero anchors and independent tag copies', () => {
    const tags = ['coast', 'port']

    const input = {
      graphMap: {
        territories: { beta: { name: '', tags: [] }, alpha: { name: 'Alpha', tags } },
        adjacency: { beta: ['alpha'], alpha: ['beta'] },
      },
      anchors: { alpha: { x: 0, y: 0 } },
      playerLimits: { minPlayers: 2, maxPlayers: 4 },
    }

    const before = structuredClone(input)
    const result = buildMapExportJson(input)
    expect(JSON.stringify(result.territories)).toBe(
      '[{"id":"alpha","name":"Alpha","tags":["coast","port"],"x":0,"y":0},{"id":"beta"}]',
    )
    expect(Object.hasOwn(result.territories[1]!, 'name')).toBe(false)
    expect(Object.hasOwn(result.territories[1]!, 'tags')).toBe(false)
    expect(Object.hasOwn(result.territories[1]!, 'x')).toBe(false)
    expect(Object.hasOwn(result.territories[1]!, 'y')).toBe(false)
    expect(result.territories[0]!.tags).not.toBe(tags)
    result.territories[0]!.tags!.push('export-only')
    expect(input).toEqual(before)
  })

  test('retains truthy names verbatim and omits optional properties when absent', () => {
    const result = buildMapExportJson({
      graphMap: { territories: { a: { name: '   ' }, b: {} }, adjacency: {} },
      anchors: {},
      playerLimits: { minPlayers: 2, maxPlayers: 2 },
    })

    expect(result.territories).toEqual([{ id: 'a', name: '   ' }, { id: 'b' }])
  })
})

test.each(['2', null, true, 2.5])('import rejects non-integer numeric fields: %j', (value) => {
  const result = parseMapImportJson(
    JSON.stringify({
      territories: [{ id: 'a' }],
      adjacency: { a: [] },
      continents: [{ id: 'north', bonus: value, territoryIds: ['a'] }],
      playerLimits: { minPlayers: value, maxPlayers: value },
    }),
  )

  expect(result.value).toBeNull()
  expect(result.errors).toContain('continents.0.bonus must be an integer')
  expect(result.errors).toContain('playerLimits.minPlayers must be an integer')
  expect(result.errors).toContain('playerLimits.maxPlayers must be an integer')
})
