import { convexTest } from "convex-test";
import type { GameState, PlayerId, TeamId } from "risk-engine";
import schema from "../schema";
import { publicGameStateProjection } from "../gameState";

const CURRENT_PLAYER_ID = "player-alpha" as PlayerId;
const OTHER_PLAYER_ID = "player-bravo" as PlayerId;

function preRefactorIndividualState(): GameState {
  return {
    players: {
      [CURRENT_PLAYER_ID]: { status: "alive" },
      [OTHER_PLAYER_ID]: { status: "alive" },
    },
    turnOrder: [CURRENT_PLAYER_ID, OTHER_PLAYER_ID],
    territories: {
      alaska: { ownerId: CURRENT_PLAYER_ID, armies: 5 },
      kamchatka: { ownerId: OTHER_PLAYER_ID, armies: 3 },
    },
    turn: { currentPlayerId: CURRENT_PLAYER_ID, phase: "Attack", round: 6 },
    deck: { draw: [], discard: [] },
    cardsById: {},
    hands: { [CURRENT_PLAYER_ID]: [], [OTHER_PLAYER_ID]: [] },
    tradesCompleted: 2,
    capturedThisTurn: false,
    fortifiesUsedThisTurn: 0,
    rng: { seed: "persisted-before-game-transition", index: 17 },
    stateVersion: 41,
    rulesetVersion: 1,
  };
}

function createCompatibilityTest() {
  return convexTest({
    schema,
    modules: {
      "./_generated/server.js": () => import("../_generated/server.js"),
      "./gameplay.ts": () => import("../gameplay"),
      "./asyncTurns.ts": () => import("../asyncTurns"),
      "./turnNotifications.ts": () => import("../turnNotifications"),
      "./eliminationNotifications.ts": () => import("../eliminationNotifications"),
    },
  });
}

export async function seedPreRefactorIndividualGame() {
  const t = createCompatibilityTest();
  const state = preRefactorIndividualState();
  const gameId = await t.run(async (ctx) => {
    const imageStorageId = await ctx.storage.store(new Blob(["pre-refactor-map"]));
    await ctx.db.insert("maps", {
      mapId: "pre-refactor-map",
      name: "Pre-refactor Map",
      graphMap: {
        territories: { alaska: {}, kamchatka: {} },
        adjacency: { alaska: ["kamchatka"], kamchatka: ["alaska"] },
      },
      visual: {
        imageStorageId,
        imageWidth: 1,
        imageHeight: 1,
        territoryAnchors: {},
      },
      authoring: { status: "published", updatedAt: 1, publishedAt: 1 },
      createdAt: 1,
    });

    const insertedGameId = await ctx.db.insert("games", {
      name: "Persisted Individual Game",
      mapId: "pre-refactor-map",
      status: "active",
      visibility: "unlisted",
      timingMode: "realtime",
      maxPlayers: 2,
      createdBy: "smoke-user-alpha",
      createdAt: 1_710_000_000_000,
      startedAt: 1_710_000_100_000,
    });
    await ctx.db.insert("gamePlayers", {
      gameId: insertedGameId,
      userId: "smoke-user-alpha",
      displayName: "Smoke Alpha",
      role: "host",
      joinedAt: 1_710_000_000_000,
      enginePlayerId: CURRENT_PLAYER_ID,
    });
    await ctx.db.insert("gamePlayers", {
      gameId: insertedGameId,
      userId: "smoke-user-bravo",
      displayName: "Smoke Bravo",
      role: "player",
      joinedAt: 1_710_000_050_000,
      enginePlayerId: OTHER_PLAYER_ID,
    });
    await ctx.db.insert("gameStates", {
      gameId: insertedGameId,
      version: state.stateVersion,
      privateState: state,
      publicState: publicGameStateProjection(state),
      updatedAt: 1_710_000_200_000,
    });
    await ctx.db.insert("gameStateSnapshots", {
      gameId: insertedGameId,
      index: -1,
      publicState: publicGameStateProjection(state),
      createdAt: 1_710_000_100_000,
    });
    await ctx.db.insert("gameActions", {
      gameId: insertedGameId,
      index: 87,
      playerId: OTHER_PLAYER_ID,
      action: { type: "EndTurn" },
      events: [{
        type: "TurnAdvanced",
        fromPlayerId: OTHER_PLAYER_ID,
        toPlayerId: CURRENT_PLAYER_ID,
        round: 6,
      }],
      publicStatePatch: {
        turn: { currentPlayerId: CURRENT_PLAYER_ID, phase: "Attack", round: 6 },
        stateVersion: 41,
      },
      stateVersionBefore: 40,
      stateVersionAfter: 41,
      createdAt: 1_710_000_200_000,
    });
    return insertedGameId;
  });

  return {
    t,
    gameId,
    currentPlayerId: CURRENT_PLAYER_ID,
    stateVersion: state.stateVersion,
  };
}

export async function seedPreRefactorAsyncGame() {
  const fixture = await seedPreRefactorIndividualGame();
  const expectedTurnStartedAt = 1_720_000_000_000;
  await fixture.t.run((ctx) =>
    ctx.db.patch(fixture.gameId, {
      timingMode: "async_1d",
      excludeWeekends: false,
      turnStartedAt: expectedTurnStartedAt,
      turnDeadlineAt: 1_720_000_100_000,
    }),
  );

  return {
    ...fixture,
    nextPlayerId: OTHER_PLAYER_ID,
    expectedTurnStartedAt,
  };
}

export async function seedPreRefactorTeamGame() {
  const t = createCompatibilityTest();
  const currentPlayerId = "team-player-alpha" as PlayerId;
  const teammatePlayerId = "team-player-bravo" as PlayerId;
  const enemyPlayerId = "team-player-charlie" as PlayerId;
  const teamOne = "team-1" as TeamId;
  const teamTwo = "team-2" as TeamId;
  const territoryId = "north";
  const delegatedUserId = "smoke-user-bravo";
  const state: GameState = {
    players: {
      [currentPlayerId]: { status: "alive", teamId: teamOne },
      [teammatePlayerId]: { status: "alive", teamId: teamOne },
      [enemyPlayerId]: { status: "alive", teamId: teamTwo },
    },
    turnOrder: [currentPlayerId, enemyPlayerId, teammatePlayerId],
    territories: {
      [territoryId]: { ownerId: currentPlayerId, armies: 2 },
      center: { ownerId: teammatePlayerId, armies: 2 },
      south: { ownerId: enemyPlayerId, armies: 2 },
    },
    turn: { currentPlayerId, phase: "Reinforcement", round: 4 },
    reinforcements: { remaining: 3, sources: { territory: 3 } },
    deck: { draw: [], discard: [] },
    cardsById: {},
    hands: {
      [currentPlayerId]: [],
      [teammatePlayerId]: [],
      [enemyPlayerId]: [],
    },
    tradesCompleted: 1,
    capturedThisTurn: false,
    fortifiesUsedThisTurn: 0,
    rng: { seed: "persisted-team-before-game-transition", index: 9 },
    stateVersion: 41,
    rulesetVersion: 1,
  };

  const gameId = await t.run(async (ctx) => {
    const imageStorageId = await ctx.storage.store(new Blob(["pre-refactor-team-map"]));
    await ctx.db.insert("maps", {
      mapId: "pre-refactor-team-map",
      name: "Pre-refactor Team Map",
      graphMap: {
        territories: { north: {}, center: {}, south: {} },
        adjacency: {
          north: ["center"],
          center: ["north", "south"],
          south: ["center"],
        },
      },
      visual: {
        imageStorageId,
        imageWidth: 1,
        imageHeight: 1,
        territoryAnchors: {},
      },
      authoring: { status: "published", updatedAt: 1, publishedAt: 1 },
      createdAt: 1,
    });
    const insertedGameId = await ctx.db.insert("games", {
      name: "Persisted Team Game",
      mapId: "pre-refactor-team-map",
      status: "active",
      visibility: "unlisted",
      timingMode: "realtime",
      maxPlayers: 4,
      teamModeEnabled: true,
      teamCount: 2,
      teamNames: { "team-1": "North", "team-2": "South" },
      teamAssignmentStrategy: "manual",
      createdBy: "smoke-user-alpha",
      createdAt: 1_710_000_000_000,
      startedAt: 1_710_000_100_000,
    });
    await ctx.db.insert("gameStates", {
      gameId: insertedGameId,
      version: state.stateVersion,
      privateState: state,
      publicState: publicGameStateProjection(state),
      updatedAt: 1_710_000_200_000,
    });
    await ctx.db.insert("gameStateSnapshots", {
      gameId: insertedGameId,
      index: -1,
      publicState: publicGameStateProjection(state),
      createdAt: 1_710_000_100_000,
    });
    await ctx.db.insert("gameActions", {
      gameId: insertedGameId,
      index: 30,
      playerId: enemyPlayerId,
      action: { type: "EndTurn" },
      events: [],
      publicStatePatch: {
        turn: { currentPlayerId, phase: "Reinforcement", round: 4 },
        reinforcements: { remaining: 3, sources: { territory: 3 } },
        stateVersion: 41,
      },
      stateVersionBefore: 40,
      stateVersionAfter: 41,
      createdAt: 1_710_000_200_000,
    });
    return insertedGameId;
  });

  return {
    t,
    gameId,
    currentPlayerId,
    delegatedUserId,
    stateVersion: state.stateVersion,
    territoryId,
  };
}
