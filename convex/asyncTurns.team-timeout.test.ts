import { describe, expect, test } from 'bun:test'
import { defaultRuleset } from 'risk-engine'
import type { GameState, GraphMap, RulesetConfig } from 'risk-engine'
import { playerId, teamId, cardId, territoryId } from '../packages/risk-engine/src/testing/fixtures'
import { applyTimeoutTurnResolution } from './asyncTurns'

const P1 = playerId('p1')
const P2 = playerId('p2')
const P3 = playerId('p3')
const TEAM_1 = teamId('team-1')
const TEAM_2 = teamId('team-2')
const C1 = cardId('c1')
const C2 = cardId('c2')
const C3 = cardId('c3')
const C4 = cardId('c4')
const C5 = cardId('c5')

const teamRuleset: RulesetConfig = {
  ...defaultRuleset,
  teams: {
    ...defaultRuleset.teams,
    teamsEnabled: true,
    preventAttackingTeammates: false,
    allowPlaceOnTeammate: true,
    allowFortifyWithTeammate: true,
    allowFortifyThroughTeammates: true,
    winCondition: 'lastTeamStanding',
    continentBonusRecipient: 'majorityHolderOnTeam',
  },
}

const map: GraphMap = {
  territories: {
    t1: {},
    t2: {},
    t3: {},
    t4: {},
  },
  adjacency: {
    t1: [],
    t2: [],
    t3: [],
    t4: [],
  },
}

function makeState(): GameState {
  return {
    players: {
      [P1]: { status: 'alive', teamId: TEAM_1 },
      [P2]: { status: 'alive', teamId: TEAM_1 },
      [P3]: { status: 'alive', teamId: TEAM_2 },
    },
    turnOrder: [P1, P2, P3],
    territories: {
      t1: { ownerId: P1, armies: 2 },
      t2: { ownerId: P1, armies: 3 },
      t3: { ownerId: P2, armies: 4 },
      t4: { ownerId: P3, armies: 4 },
    },
    turn: { currentPlayerId: P1, phase: 'Reinforcement', round: 1 },
    reinforcements: { remaining: 5, sources: { territory: 5 } },
    deck: { draw: [], discard: [] },
    cardsById: {},
    hands: { [P1]: [], [P2]: [], [P3]: [] },
    tradesCompleted: 0,
    capturedThisTurn: false,
    fortifiesUsedThisTurn: 0,
    rng: { seed: 'team-timeout', index: 0 },
    stateVersion: 1,
    rulesetVersion: 1,
  }
}

describe('team timeout behavior', () => {
  test('timeout policy consumes stored engine RNG deterministically', () => {
    const first = applyTimeoutTurnResolution({
      state: makeState(),
      playerId: P1,
      graphMap: map,
      ruleset: teamRuleset,
    })

    const second = applyTimeoutTurnResolution({
      state: makeState(),
      playerId: P1,
      graphMap: map,
      ruleset: teamRuleset,
    })

    expect(first?.actionLogs.map((log) => log.action)).toEqual(
      second?.actionLogs.map((log) => log.action),
    )
    expect(first?.nextState.rng.index).toBe(5)
  })
  test("timed-out reinforcements are auto-placed only on timed-out player's territories", () => {
    const resolution = applyTimeoutTurnResolution({
      state: makeState(),
      playerId: P1,
      graphMap: map,
      ruleset: teamRuleset,
    })

    expect(resolution).not.toBeNull()

    const placementLogs = (resolution?.actionLogs ?? []).filter(
      (log) => log.action.type === 'PlaceReinforcements',
    )

    expect(placementLogs.length).toBeGreaterThan(0)

    for (const log of placementLogs) {
      expect(log.action.type).toBe('PlaceReinforcements')

      if (log.action.type !== 'PlaceReinforcements') continue
      expect(['t1', 't2']).toContain(log.action.territoryId)
      expect(log.action.territoryId).not.toBe('t3')
    }

    expect(resolution?.nextState.turn.currentPlayerId).toBe(P2)
    expect(resolution?.nextState.turn.phase).toBe('Reinforcement')
  })

  test('timed-out reinforcement resolution ignores forced trade when player is at threshold', () => {
    const resolution = applyTimeoutTurnResolution({
      state: {
        ...makeState(),
        hands: {
          [P1]: [C1, C2, C3, C4, C5],
          [P2]: [],
          [P3]: [],
        },
      },
      playerId: P1,
      graphMap: map,
      ruleset: teamRuleset,
    })

    expect(resolution).not.toBeNull()
    expect(
      (resolution?.actionLogs ?? []).some((log) => log.action.type === 'PlaceReinforcements'),
    ).toBe(true)
    expect(resolution?.nextState.turn.currentPlayerId).toBe(P2)
    expect(resolution?.nextState.turn.phase).toBe('Reinforcement')
  })

  test('timed-out pending occupation completes the ordinary turn sequence', () => {
    const resolution = applyTimeoutTurnResolution({
      state: {
        ...makeState(),
        turn: { currentPlayerId: P1, phase: 'Occupy', round: 1 },
        reinforcements: undefined,
        pending: {
          type: 'Occupy',
          from: territoryId('t1'),
          to: territoryId('t2'),
          minMove: 1,
          maxMove: 1,
        },
        territories: {
          ...makeState().territories,
          t1: { ownerId: P1, armies: 3 },
          t2: { ownerId: P1, armies: 0 },
        },
      },
      playerId: P1,
      graphMap: map,
      ruleset: teamRuleset,
    })

    expect(resolution?.actionLogs.map((log) => log.action.type)).toEqual([
      'Occupy',
      'EndAttackPhase',
      'EndTurn',
    ])
    expect(resolution?.nextState.turn.currentPlayerId).toBe(P2)
  })
})
