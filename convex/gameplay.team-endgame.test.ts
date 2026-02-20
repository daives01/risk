import { describe, expect, test } from "bun:test";
import { defaultRuleset } from "risk-engine";
import type { CardId, GameState, GraphMap, PlayerId, RulesetConfig, TeamId, TerritoryId } from "risk-engine";
import { applyResignForTimeline } from "./gameplay";

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;
const P3 = "p3" as PlayerId;
const P4 = "p4" as PlayerId;
const TEAM_1 = "team-1" as TeamId;
const TEAM_2 = "team-2" as TeamId;

const teamRuleset: RulesetConfig = {
  ...defaultRuleset,
  teams: {
    ...defaultRuleset.teams,
    teamsEnabled: true,
    preventAttackingTeammates: false,
    allowPlaceOnTeammate: true,
    allowFortifyWithTeammate: true,
    allowFortifyThroughTeammates: true,
    winCondition: "lastTeamStanding",
    continentBonusRecipient: "majorityHolderOnTeam",
  },
};

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
};

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    players: {
      [P1]: { status: "alive", teamId: TEAM_1 },
      [P2]: { status: "alive", teamId: TEAM_1 },
      [P3]: { status: "alive", teamId: TEAM_2 },
      [P4]: { status: "alive", teamId: TEAM_2 },
    },
    turnOrder: [P1, P2, P3, P4],
    territories: {
      t1: { ownerId: P1, armies: 3 },
      t2: { ownerId: P1, armies: 2 },
      t3: { ownerId: P2, armies: 2 },
      t4: { ownerId: P3, armies: 2 },
      t5: { ownerId: P4, armies: 2 },
    } as Record<string, { ownerId: PlayerId | "neutral"; armies: number }>,
    turn: { currentPlayerId: P1, phase: "Reinforcement", round: 1 },
    reinforcements: { remaining: 4, sources: { territory: 4 } },
    deck: { draw: [], discard: [] },
    cardsById: {},
    hands: {
      [P1]: ["c1" as CardId],
      [P2]: [],
      [P3]: [],
      [P4]: [],
    },
    tradesCompleted: 0,
    capturedThisTurn: false,
    fortifiesUsedThisTurn: 0,
    rng: { seed: "team-endgame", index: 0 },
    stateVersion: 1,
    rulesetVersion: 1,
    ...overrides,
  };
}

describe("team endgame resign behavior", () => {
  test("resigning only defeats the player and neutralizes only their territories", () => {
    const initial = makeState();
    const next = applyResignForTimeline(initial, P1, map, teamRuleset);

    expect(next.players[P1]?.status).toBe("defeated");
    expect(next.players[P2]?.status).toBe("alive");
    expect(next.territories.t1?.ownerId).toBe("neutral");
    expect(next.territories.t2?.ownerId).toBe("neutral");
    expect(next.territories.t3?.ownerId).toBe(P2);
    expect(next.turn.phase).toBe("Reinforcement");
    expect(next.turn.currentPlayerId).toBe(P2);
  });

  test("resigning the final member of a team ends the game", () => {
    const initial = makeState({
      players: {
        [P1]: { status: "alive", teamId: TEAM_1 },
        [P3]: { status: "alive", teamId: TEAM_2 },
      },
      turnOrder: [P1, P3],
      territories: {
        t1: { ownerId: P1, armies: 3 },
        t4: { ownerId: P3, armies: 2 },
      } as Record<string, { ownerId: PlayerId | "neutral"; armies: number }>,
      hands: {
        [P1]: [],
        [P3]: [],
      },
      turn: { currentPlayerId: P3, phase: "Reinforcement", round: 1 },
      reinforcements: { remaining: 3, sources: { territory: 3 } },
    });

    const next = applyResignForTimeline(initial, P3, map, teamRuleset);
    expect(next.players[P3]?.status).toBe("defeated");
    expect(next.turn.phase).toBe("GameOver");
  });
});
