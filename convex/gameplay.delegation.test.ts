import { describe, expect, test } from "bun:test";
import type { CardId, GameState, PlayerId, TeamId } from "risk-engine";
import { resolveActingPlayerFromDocs } from "./gameplay";

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;
const P3 = "p3" as PlayerId;
const TEAM_1 = "team-1" as TeamId;
const TEAM_2 = "team-2" as TeamId;

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    players: {
      [P1]: { status: "alive", teamId: TEAM_1 },
      [P2]: { status: "alive", teamId: TEAM_1 },
      [P3]: { status: "alive", teamId: TEAM_2 },
    },
    turnOrder: [P1, P2, P3],
    territories: {
      t1: { ownerId: P1, armies: 3 },
      t2: { ownerId: P2, armies: 3 },
      t3: { ownerId: P3, armies: 3 },
    },
    turn: { currentPlayerId: P1, phase: "Reinforcement", round: 1 },
    reinforcements: { remaining: 3, sources: { territory: 3 } },
    deck: { draw: [], discard: [] },
    cardsById: {},
    hands: { [P1]: [], [P2]: [], [P3]: [] } as Record<PlayerId, CardId[]>,
    tradesCompleted: 0,
    capturedThisTurn: false,
    fortifiesUsedThisTurn: 0,
    rng: { seed: "delegation", index: 0 },
    stateVersion: 1,
    rulesetVersion: 1,
    ...overrides,
  };
}

describe("turn delegation authorization", () => {
  test("allows an opted-in active teammate turn owner", () => {
    const actingPlayer = resolveActingPlayerFromDocs({
      requestedPlayerId: P1,
      callerId: "user-p2",
      callerPlayer: { enginePlayerId: P2, teamId: TEAM_1 },
      targetPlayer: { enginePlayerId: P1, teamId: TEAM_1 },
      targetAllowsDelegation: true,
      game: { teamModeEnabled: true },
      state: makeState(),
    });

    expect(actingPlayer).toEqual({
      playerId: P1,
      actingUserId: "user-p2",
      wasDelegated: true,
    });
  });

  test("allows a defeated teammate to act for a living turn owner", () => {
    const actingPlayer = resolveActingPlayerFromDocs({
      requestedPlayerId: P1,
      callerId: "user-p2",
      callerPlayer: { enginePlayerId: P2, teamId: TEAM_1 },
      targetPlayer: { enginePlayerId: P1, teamId: TEAM_1 },
      targetAllowsDelegation: true,
      game: { teamModeEnabled: true },
      state: makeState({
        players: {
          [P1]: { status: "alive", teamId: TEAM_1 },
          [P2]: { status: "defeated", teamId: TEAM_1 },
          [P3]: { status: "alive", teamId: TEAM_2 },
        },
      }),
    });

    expect(actingPlayer.playerId).toBe(P1);
    expect(actingPlayer.wasDelegated).toBe(true);
  });

  test("returns the caller for their own action without requiring delegation", () => {
    const actingPlayer = resolveActingPlayerFromDocs({
      callerId: "user-p1",
      callerPlayer: { enginePlayerId: P1, teamId: TEAM_1 },
      game: { teamModeEnabled: false },
      state: makeState(),
    });

    expect(actingPlayer).toEqual({
      playerId: P1,
      actingUserId: "user-p1",
      wasDelegated: false,
    });
  });

  test("rejects delegation when the target has not opted in", () => {
    expect(() =>
      resolveActingPlayerFromDocs({
        requestedPlayerId: P1,
        callerId: "user-p2",
        callerPlayer: { enginePlayerId: P2, teamId: TEAM_1 },
        targetPlayer: { enginePlayerId: P1, teamId: TEAM_1 },
        targetAllowsDelegation: false,
        game: { teamModeEnabled: true },
        state: makeState(),
      }),
    ).toThrow("This teammate has not allowed delegated turns");
  });

  test("rejects delegation for non-team games", () => {
    expect(() =>
      resolveActingPlayerFromDocs({
        requestedPlayerId: P1,
        callerId: "user-p2",
        callerPlayer: { enginePlayerId: P2, teamId: TEAM_1 },
        targetPlayer: { enginePlayerId: P1, teamId: TEAM_1 },
        targetAllowsDelegation: true,
        game: { teamModeEnabled: false },
        state: makeState(),
      }),
    ).toThrow("Turn delegation is only available in team games");
  });

  test("rejects delegation across teams", () => {
    expect(() =>
      resolveActingPlayerFromDocs({
        requestedPlayerId: P1,
        callerId: "user-p3",
        callerPlayer: { enginePlayerId: P3, teamId: TEAM_2 },
        targetPlayer: { enginePlayerId: P1, teamId: TEAM_1 },
        targetAllowsDelegation: true,
        game: { teamModeEnabled: true },
        state: makeState(),
      }),
    ).toThrow("You can only play for a teammate");
  });

  test("rejects delegation for a player who is not the active turn owner", () => {
    expect(() =>
      resolveActingPlayerFromDocs({
        requestedPlayerId: P2,
        callerId: "user-p1",
        callerPlayer: { enginePlayerId: P1, teamId: TEAM_1 },
        targetPlayer: { enginePlayerId: P2, teamId: TEAM_1 },
        targetAllowsDelegation: true,
        game: { teamModeEnabled: true },
        state: makeState(),
      }),
    ).toThrow("You can only play for the active turn owner");
  });

  test("rejects delegation for a defeated turn owner", () => {
    expect(() =>
      resolveActingPlayerFromDocs({
        requestedPlayerId: P1,
        callerId: "user-p2",
        callerPlayer: { enginePlayerId: P2, teamId: TEAM_1 },
        targetPlayer: { enginePlayerId: P1, teamId: TEAM_1 },
        targetAllowsDelegation: true,
        game: { teamModeEnabled: true },
        state: makeState({
          players: {
            [P1]: { status: "defeated", teamId: TEAM_1 },
            [P2]: { status: "alive", teamId: TEAM_1 },
            [P3]: { status: "alive", teamId: TEAM_2 },
          },
        }),
      }),
    ).toThrow("You can only play for an alive teammate");
  });
});
