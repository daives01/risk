import { describe, expect, test } from "bun:test";
import { defaultRuleset } from "risk-engine";
import type { CardId, GameState, GraphMap, PlayerId, RulesetConfig, TeamId } from "risk-engine";
import { applyTimeoutTurnResolution } from "./asyncTurns";

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;
const P3 = "p3" as PlayerId;
const TEAM_1 = "team-1" as TeamId;
const TEAM_2 = "team-2" as TeamId;
const C1 = "c1" as CardId;
const C2 = "c2" as CardId;
const C3 = "c3" as CardId;
const C4 = "c4" as CardId;
const C5 = "c5" as CardId;

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
  },
  adjacency: {
    t1: [],
    t2: [],
    t3: [],
    t4: [],
  },
};

function makeState(): GameState {
  return {
    players: {
      [P1]: { status: "alive", teamId: TEAM_1 },
      [P2]: { status: "alive", teamId: TEAM_1 },
      [P3]: { status: "alive", teamId: TEAM_2 },
    },
    turnOrder: [P1, P2, P3],
    territories: {
      t1: { ownerId: P1, armies: 2 },
      t2: { ownerId: P1, armies: 3 },
      t3: { ownerId: P2, armies: 4 },
      t4: { ownerId: P3, armies: 4 },
    },
    turn: { currentPlayerId: P1, phase: "Reinforcement", round: 1 },
    reinforcements: { remaining: 5, sources: { territory: 5 } },
    deck: { draw: [], discard: [] },
    cardsById: {},
    hands: { [P1]: [], [P2]: [], [P3]: [] },
    tradesCompleted: 0,
    capturedThisTurn: false,
    fortifiesUsedThisTurn: 0,
    rng: { seed: "team-timeout", index: 0 },
    stateVersion: 1,
    rulesetVersion: 1,
  };
}

describe("team timeout behavior", () => {
  test("timed-out reinforcements are auto-placed only on timed-out player's territories", () => {
    const resolution = applyTimeoutTurnResolution({
      state: makeState(),
      playerId: P1,
      graphMap: map,
      ruleset: teamRuleset,
    });
    expect(resolution).not.toBeNull();

    const placementLogs = (resolution?.actionLogs ?? []).filter((log) => log.action.type === "PlaceReinforcements");
    expect(placementLogs.length).toBeGreaterThan(0);
    for (const log of placementLogs) {
      expect(log.action.type).toBe("PlaceReinforcements");
      if (log.action.type !== "PlaceReinforcements") continue;
      expect(["t1", "t2"]).toContain(log.action.territoryId);
      expect(log.action.territoryId).not.toBe("t3");
    }

    expect(resolution?.nextState.turn.currentPlayerId).toBe(P2);
    expect(resolution?.nextState.turn.phase).toBe("Reinforcement");
  });

  test("timed-out reinforcement resolution ignores forced trade when player is at threshold", () => {
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
    });

    expect(resolution).not.toBeNull();
    expect(
      (resolution?.actionLogs ?? []).some((log) => log.action.type === "PlaceReinforcements"),
    ).toBe(true);
    expect(resolution?.nextState.turn.currentPlayerId).toBe(P2);
    expect(resolution?.nextState.turn.phase).toBe("Reinforcement");
  });
});
