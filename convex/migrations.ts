import { internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  GAME_STATE_SNAPSHOT_INTERVAL,
  insertGameStateSnapshotIfMissing,
  shouldStoreGameStateSnapshot,
  upsertCurrentGameState,
} from "./gameState";
import { readGameStateNullable } from "./typeAdapters";

export const backfillGameStates = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    gameId: v.optional(v.id("games")),
  },
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(200, Math.floor(args.batchSize ?? 50)));
    const games = args.gameId
      ? [await ctx.db.get(args.gameId)].filter((game): game is Doc<"games"> => !!game)
      : await ctx.db.query("games").take(batchSize);

    let scanned = 0;
    let backfilled = 0;
    let skipped = 0;
    for (const game of games) {
      scanned += 1;

      // Reads obsolete games.state only for live-migration backfill.
      const state = readGameStateNullable(game.state);
      if (!state) {
        skipped += 1;
        continue;
      }

      const existing = await ctx.db
        .query("gameStates")
        .withIndex("by_gameId", (q) => q.eq("gameId", game._id))
        .unique();
      if (existing?.version === state.stateVersion) {
        skipped += 1;
        continue;
      }

      await upsertCurrentGameState(ctx, {
        gameId: game._id,
        state,
        updatedAt: Date.now(),
      });
      backfilled += 1;
    }

    return {
      scanned,
      backfilled,
      skipped,
      done: args.gameId ? true : games.length < batchSize,
    };
  },
});

export const backfillGameStateSnapshots = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    gameId: v.optional(v.id("games")),
  },
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(500, Math.floor(args.batchSize ?? 100)));
    const games = args.gameId
      ? [await ctx.db.get(args.gameId)].filter((game): game is Doc<"games"> => !!game)
      : await ctx.db.query("games").take(batchSize);

    let scanned = 0;
    let inserted = 0;
    let skipped = 0;
    for (const game of games) {
      scanned += 1;

      // Reads obsolete games.initialState only for live-migration backfill.
      const initialState = readGameStateNullable(game.initialState);
      if (initialState) {
        const result = await insertGameStateSnapshotIfMissing(ctx, {
          gameId: game._id,
          index: -1,
          state: initialState,
          createdAt: game.startedAt ?? game.createdAt,
        });
        if (result) inserted += 1;
      }

      // Reads obsolete games.state only for live-migration backfill.
      const currentState = readGameStateNullable(game.state);
      const latestAction = await ctx.db
        .query("gameActions")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", game._id))
        .order("desc")
        .first();
      if (currentState && latestAction && shouldStoreGameStateSnapshot(latestAction.index)) {
        const result = await insertGameStateSnapshotIfMissing(ctx, {
          gameId: game._id,
          index: latestAction.index,
          state: currentState,
          createdAt: latestAction.createdAt,
        });
        if (result) inserted += 1;
      }

      if (!initialState && !currentState) skipped += 1;
    }

    return {
      scanned,
      inserted,
      skipped,
      interval: GAME_STATE_SNAPSHOT_INTERVAL,
      done: args.gameId ? true : games.length < batchSize,
    };
  },
});
