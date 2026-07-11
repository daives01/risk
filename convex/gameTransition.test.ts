import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import type { GameState, PlayerId } from "risk-engine";
import schema from "./schema";
import { executeGameTransition, GameTransitionRejected } from "./gameTransition";

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;

function state(phase: "Reinforcement" | "Attack" = "Attack"): GameState {
  return {
    players: { [P1]: { status: "alive" }, [P2]: { status: "alive" } },
    turnOrder: [P1, P2],
    territories: { t1: { ownerId: P1, armies: 3 }, t2: { ownerId: P2, armies: 3 } },
    turn: { currentPlayerId: P1, phase, round: 1 },
    ...(phase === "Reinforcement" ? { reinforcements: { remaining: 3 } } : {}),
    deck: { draw: [], discard: [] },
    cardsById: {},
    hands: { [P1]: [], [P2]: [] },
    tradesCompleted: 0,
    capturedThisTurn: false,
    rng: { seed: "transition-test", index: 0 },
    stateVersion: 7,
    rulesetVersion: 1,
  };
}

async function seed(phase: "Reinforcement" | "Attack" = "Attack") {
  const t = convexTest({
    schema,
    modules: {
      "./_generated/server.js": () => import("./_generated/server.js"),
      "./asyncTurns.ts": () => import("./asyncTurns"),
      "./turnNotifications.ts": () => import("./turnNotifications"),
      "./eliminationNotifications.ts": () => import("./eliminationNotifications"),
    },
  });
  const ids = await t.run(async (ctx) => {
    const imageStorageId = await ctx.storage.store(new Blob(["map"]));
    await ctx.db.insert("maps", {
      mapId: "test-map",
      name: "Test Map",
      graphMap: {
        territories: { t1: {}, t2: {} },
        adjacency: { t1: ["t2"], t2: ["t1"] },
      },
      visual: { imageStorageId, imageWidth: 1, imageHeight: 1, territoryAnchors: {} },
      authoring: { status: "published", updatedAt: 1, publishedAt: 1 },
      createdAt: 1,
    });
    const gameId = await ctx.db.insert("games", {
      name: "Transition Test",
      mapId: "test-map",
      status: "active",
      visibility: "unlisted",
      timingMode: "realtime",
      maxPlayers: 2,
      createdBy: "user-1",
      createdAt: 1,
      startedAt: 1,
    });
    const initial = state(phase);
    await ctx.db.insert("gameStates", {
      gameId,
      version: initial.stateVersion,
      privateState: initial,
      publicState: {},
      updatedAt: 1,
    });
    return { gameId };
  });
  return { t, ...ids };
}

describe("Game Transition transaction", () => {
  test("commits a direct action with provenance, patch, and current state atomically", async () => {
    const { t, gameId } = await seed();
    const result = await t.mutation((ctx) => executeGameTransition(ctx as any, {
      gameId,
      source: { type: "user", playerId: P1, actingUserId: "user-1", wasDelegated: false },
      intent: { type: "action", action: { type: "EndAttackPhase" }, expectedVersion: 7 },
      now: 1234,
    }));

    expect(result.newVersion).toBe(8);
    const persisted = await t.run(async (ctx) => ({
      frames: await ctx.db.query("gameActions").collect(),
      current: await ctx.db.query("gameStates").unique(),
    }));
    expect(persisted.frames).toHaveLength(1);
    expect(persisted.frames[0]).toMatchObject({
      index: 0,
      actingUserId: "user-1",
      wasDelegated: false,
      stateVersionBefore: 7,
      stateVersionAfter: 8,
      createdAt: 1234,
    });
    expect(persisted.frames[0]?.publicStatePatch).toMatchObject({ stateVersion: 8, turn: { phase: "Fortify" } });
    expect((persisted.current?.privateState as GameState).turn.phase).toBe("Fortify");
  });

  test("keeps a reinforcement batch as one delegated History Frame", async () => {
    const { t, gameId } = await seed("Reinforcement");
    await t.mutation((ctx) => executeGameTransition(ctx as any, {
      gameId,
      source: { type: "user", playerId: P1, actingUserId: "teammate-user", wasDelegated: true },
      intent: { type: "reinforcement_batch", placements: [{ territoryId: "t1", count: 1 }, { territoryId: "t1", count: 2 }], expectedVersion: 7 },
      now: 2222,
    }));

    const frames = await t.run((ctx) => ctx.db.query("gameActions").collect());
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ index: 0, wasDelegated: true, actingUserId: "teammate-user", stateVersionAfter: 9 });
    expect(frames[0]?.action).toMatchObject({ type: "PlaceReinforcementsBatch" });
  });

  test("commits every system-timeout frame contiguously without User provenance", async () => {
    const { t, gameId } = await seed("Reinforcement");
    const transitionNow = Date.now();
    await t.run((ctx) => ctx.db.patch(gameId, {
      timingMode: "async_1d",
      turnStartedAt: transitionNow - 100,
      turnDeadlineAt: transitionNow - 1,
    }));
    const result = await t.mutation((ctx) => executeGameTransition(ctx as any, {
      gameId,
      source: { type: "system_timeout", playerId: P1 },
      intent: { type: "timeout", expectedPlayerId: P1, expectedTurnStartedAt: transitionNow - 100 },
      now: transitionNow,
    }));

    expect(result.frameCount).toBeGreaterThan(1);
    const persisted = await t.run(async (ctx) => ({
      frames: await ctx.db.query("gameActions").withIndex("by_gameId_index", (q) => q.eq("gameId", gameId)).collect(),
      snapshots: await ctx.db.query("gameStateSnapshots").collect(),
      current: await ctx.db.query("gameStates").unique(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(persisted.frames.map((frame) => frame.index)).toEqual(persisted.frames.map((_, index) => index));
    expect(persisted.frames.every((frame) => frame.createdAt === transitionNow && frame.actingUserId === undefined && frame.wasDelegated === undefined)).toBe(true);
    expect(persisted.frames[0]?.events).toContainEqual({ type: "TurnTimedOut", playerId: P1 });
    expect(persisted.snapshots).toHaveLength(1);
    expect((persisted.current?.privateState as GameState).rng.index).toBe(3);
    expect(persisted.scheduled.map((job) => job.name)).toContain("asyncTurns:processExpiredTurn");
    expect(persisted.scheduled.map((job) => job.name)).toContain("turnNotifications:sendTurnNotifications");
  });

  test("a non-current Engine Player can resign and persist completion and winner fields", async () => {
    const { t, gameId } = await seed();
    await t.mutation((ctx) => executeGameTransition(ctx as any, {
      gameId,
      source: { type: "user", playerId: P2, actingUserId: "user-2", wasDelegated: false },
      intent: { type: "resign" },
      now: 4444,
    }));

    const persisted = await t.run(async (ctx) => ({
      game: await ctx.db.get(gameId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(persisted.game).toMatchObject({ status: "finished", finishedAt: 4444, winningPlayerId: P1 });
    expect(persisted.scheduled.map((job) => job.name)).toContain("eliminationNotifications:sendEliminationNotifications");
  });

  test("a stale timeout rejects without writes", async () => {
    const { t, gameId } = await seed("Reinforcement");
    await t.run((ctx) => ctx.db.patch(gameId, {
      timingMode: "async_1d",
      turnStartedAt: 100,
      turnDeadlineAt: 200,
    }));
    let rejection: unknown;
    try {
      await t.mutation((ctx) => executeGameTransition(ctx as any, {
        gameId,
        source: { type: "system_timeout", playerId: P1 },
        intent: { type: "timeout", expectedPlayerId: P1, expectedTurnStartedAt: 99 },
        now: 201,
      }));
    } catch (error) {
      rejection = error;
    }
    expect((rejection as GameTransitionRejected).reason).toBe("stale_timeout");
    expect(await t.run((ctx) => ctx.db.query("gameActions").collect())).toEqual([]);
  });

  test("appends after a representative existing History Frame fixture", async () => {
    const { t, gameId } = await seed();
    await t.run((ctx) => ctx.db.insert("gameActions", {
      gameId,
      index: 4,
      playerId: P2,
      action: { type: "EndTurn" },
      events: [],
      stateVersionBefore: 6,
      stateVersionAfter: 7,
      createdAt: 1000,
    }));
    await t.mutation((ctx) => executeGameTransition(ctx as any, {
      gameId,
      source: { type: "user", playerId: P1, actingUserId: "user-1", wasDelegated: false },
      intent: { type: "action", action: { type: "EndAttackPhase" }, expectedVersion: 7 },
      now: 1001,
    }));

    const indexes = await t.run(async (ctx) => (await ctx.db.query("gameActions")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId)).collect()).map((frame) => frame.index));
    expect(indexes).toEqual([4, 5]);
  });

  test("a stale version rejects without writing anything", async () => {
    const { t, gameId } = await seed();
    let rejection: unknown;
    try {
      await t.mutation((ctx) => executeGameTransition(ctx as any, {
        gameId,
        source: { type: "user", playerId: P1, actingUserId: "user-1", wasDelegated: false },
        intent: { type: "action", action: { type: "EndAttackPhase" }, expectedVersion: 6 },
        now: 3333,
      }));
    } catch (error) {
      rejection = error;
    }
    expect(rejection).toBeInstanceOf(GameTransitionRejected);
    expect((rejection as GameTransitionRejected).reason).toBe("stale_version");
    const persisted = await t.run(async (ctx) => ({
      frames: await ctx.db.query("gameActions").collect(),
      current: await ctx.db.query("gameStates").unique(),
    }));
    expect(persisted.frames).toEqual([]);
    expect(persisted.current?.version).toBe(7);
  });
});
