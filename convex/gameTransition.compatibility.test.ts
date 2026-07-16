import { describe, expect, test } from "bun:test";
import { api } from "./_generated/api";
import { executeGameTransition } from "./gameTransition";
import {
  seedPreRefactorIndividualGame,
  seedPreRefactorAsyncGame,
  seedPreRefactorTeamGame,
} from "./testFixtures/preRefactorGames.test";

describe("pre-refactor Game compatibility", () => {
  test("an active individual Game accepts its next transition and remains replayable", async () => {
    const { t, gameId, currentPlayerId, stateVersion } =
      await seedPreRefactorIndividualGame();

    const result = await t.mutation((ctx) =>
      executeGameTransition(ctx as never, {
        gameId,
        source: {
          type: "user",
          playerId: currentPlayerId,
          actingUserId: "smoke-user-alpha",
          wasDelegated: false,
        },
        intent: {
          type: "action",
          action: { type: "EndAttackPhase" },
          expectedVersion: stateVersion,
        },
        now: 1_720_000_000_000,
      }),
    );

    expect(result).toMatchObject({ newVersion: 42, frameCount: 1 });

    const history = await t.query(api.gameplay.getHistoryWindow, { gameId });
    expect(history.latestIndex).toBe(88);
    expect(history.actions[history.actions.length - 1]).toMatchObject({
      index: 88,
      playerId: currentPlayerId,
      action: { type: "EndAttackPhase" },
      publicStatePatch: {
        stateVersion: 42,
        turn: { currentPlayerId, phase: "Fortify", round: 6 },
      },
    });
  });

  test("an active team Game accepts a delegated reinforcement transition", async () => {
    const {
      t,
      gameId,
      currentPlayerId,
      delegatedUserId,
      stateVersion,
      territoryId,
    } = await seedPreRefactorTeamGame();

    const result = await t.mutation((ctx) =>
      executeGameTransition(ctx as never, {
        gameId,
        source: {
          type: "user",
          playerId: currentPlayerId,
          actingUserId: delegatedUserId,
          wasDelegated: true,
        },
        intent: {
          type: "reinforcement_batch",
          placements: [{ territoryId, count: 3 }],
          expectedVersion: stateVersion,
        },
        now: 1_720_000_100_000,
      }),
    );

    expect(result).toMatchObject({ newVersion: 42, frameCount: 1 });

    const history = await t.query(api.gameplay.getHistoryWindow, { gameId });
    expect(history.latestIndex).toBe(31);
    expect(history.actions[history.actions.length - 1]).toMatchObject({
      index: 31,
      playerId: currentPlayerId,
      action: {
        type: "PlaceReinforcementsBatch",
        placements: [{ territoryId, count: 3 }],
      },
      publicStatePatch: {
        stateVersion: 42,
        turn: { currentPlayerId, phase: "Attack", round: 4 },
      },
    });
  });

  test("an active async Game resolves its persisted turn deadline", async () => {
    const {
      t,
      gameId,
      currentPlayerId,
      nextPlayerId,
      expectedTurnStartedAt,
    } = await seedPreRefactorAsyncGame();

    const result = await t.mutation((ctx) =>
      executeGameTransition(ctx as never, {
        gameId,
        source: { type: "system_timeout", playerId: currentPlayerId },
        intent: {
          type: "timeout",
          expectedPlayerId: currentPlayerId,
          expectedTurnStartedAt,
        },
        now: 1_720_000_200_000,
      }),
    );

    expect(result).toMatchObject({ newVersion: 43, frameCount: 2 });

    const history = await t.query(api.gameplay.getHistoryWindow, { gameId });
    expect(history.latestIndex).toBe(89);
    expect(history.actions[history.actions.length - 1]).toMatchObject({
      index: 89,
      playerId: currentPlayerId,
      action: { type: "EndTurn" },
      publicStatePatch: {
        stateVersion: 43,
        turn: { currentPlayerId: nextPlayerId, phase: "Reinforcement", round: 6 },
      },
    });
  });
});
