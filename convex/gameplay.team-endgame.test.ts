import { playerId, teamId, cardId } from '../packages/risk-engine/src/testing/fixtures'
import { describe, expect, test } from 'bun:test'
import { applyAction, defaultRuleset } from 'risk-engine'
import type { GameState, GraphMap, RulesetConfig } from 'risk-engine'

const P1 = playerId('p1')
const P2 = playerId('p2')
const P3 = playerId('p3')
const P4 = playerId('p4')
const TEAM_1 = teamId('team-1')
const TEAM_2 = teamId('team-2')

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
    t5: {},
  },
  adjacency: {
    t1: [],
    t2: [],
    t3: [],
    t4: [],
    t5: [],
  },
}

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    players: {
      [P1]: { status: 'alive', teamId: TEAM_1 },
      [P2]: { status: 'alive', teamId: TEAM_1 },
      [P3]: { status: 'alive', teamId: TEAM_2 },
      [P4]: { status: 'alive', teamId: TEAM_2 },
    },
    turnOrder: [P1, P2, P3, P4],
    territories: {
      t1: { ownerId: P1, armies: 3 },
      t2: { ownerId: P1, armies: 2 },
      t3: { ownerId: P2, armies: 2 },
      t4: { ownerId: P3, armies: 2 },
      t5: { ownerId: P4, armies: 2 },
    },
    turn: { currentPlayerId: P1, phase: 'Reinforcement', round: 1 },
    reinforcements: { remaining: 4, sources: { territory: 4 } },
    deck: { draw: [], discard: [] },
    cardsById: {},
    hands: {
      [P1]: [cardId('c1')],
      [P2]: [],
      [P3]: [],
      [P4]: [],
    },
    tradesCompleted: 0,
    capturedThisTurn: false,
    fortifiesUsedThisTurn: 0,
    rng: { seed: 'team-endgame', index: 0 },
    stateVersion: 1,
    rulesetVersion: 1,
    ...overrides,
  }
}

describe('team endgame resign behavior', () => {
  test('resigning only defeats the player and neutralizes only their territories', () => {
    const initial = makeState()

    const next = applyAction(
      initial,
      P1,
      { type: 'Resign' },
      map,
      teamRuleset.combat,
      teamRuleset.fortify,
      teamRuleset.cards,
      teamRuleset.teams,
    ).state

    expect(next.players[P1]?.status).toBe('defeated')
    expect(next.players[P2]?.status).toBe('alive')
    expect(next.territories.t1?.ownerId).toBe('neutral')
    expect(next.territories.t2?.ownerId).toBe('neutral')
    expect(next.territories.t3?.ownerId).toBe(P2)
    expect(next.turn.phase).toBe('Reinforcement')
    expect(next.turn.currentPlayerId).toBe(P2)
  })

  test('resigning the final member of a team ends the game', () => {
    const initial = makeState({
      players: {
        [P1]: { status: 'alive', teamId: TEAM_1 },
        [P3]: { status: 'alive', teamId: TEAM_2 },
      },
      turnOrder: [P1, P3],
      territories: {
        t1: { ownerId: P1, armies: 3 },
        t4: { ownerId: P3, armies: 2 },
      },
      hands: {
        [P1]: [],
        [P3]: [],
      },
      turn: { currentPlayerId: P3, phase: 'Reinforcement', round: 1 },
      reinforcements: { remaining: 3, sources: { territory: 3 } },
    })

    const next = applyAction(
      initial,
      P3,
      { type: 'Resign' },
      map,
      teamRuleset.combat,
      teamRuleset.fortify,
      teamRuleset.cards,
      teamRuleset.teams,
    ).state

    expect(next.players[P3]?.status).toBe('defeated')
    expect(next.turn.phase).toBe('GameOver')
  })
})
