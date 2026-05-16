import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  upsertCurrentGameState,
  GAME_STATE_SNAPSHOT_INTERVAL,
  insertGameStateSnapshotIfMissing,
  shouldStoreGameStateSnapshot,
} from "./gameState";
import {
  readGameStateNullable,
} from "./typeAdapters";
import {
  applyTimelineStatePatch,
  buildTimelineStatePatch,
  shouldStoreTimelineCheckpoint,
  type TimelinePublicState,
} from "./historyTimeline";

const removedTimelineFrameFieldsWithoutState = {
  actionId: undefined,
  projectionVersion: undefined,
  actionType: undefined,
  label: undefined,
  actorId: undefined,
  turnRound: undefined,
  turnPlayerId: undefined,
  turnPhase: undefined,
  hasCapture: undefined,
  eliminatedPlayerIds: undefined,
  replayError: undefined,
  createdAt: undefined,
};

function canRemoveTimelineFrameState(frame: { checkpointState?: unknown; statePatch?: unknown }) {
  return !!frame.checkpointState || !!frame.statePatch;
}

function buildStaleTimelineFramePatch(frame: Record<string, unknown>) {
  return {
    ...removedTimelineFrameFieldsWithoutState,
    ...(canRemoveTimelineFrameState(frame) ? { state: undefined } : {}),
  };
}

function hasRemovedTimelineFrameField(frame: Record<string, unknown>) {
  return Object.keys(removedTimelineFrameFieldsWithoutState).some((field) => field in frame) ||
    (canRemoveTimelineFrameState(frame) && "state" in frame);
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildDesiredCompactTimelineFields(
  frame: { index: number; state?: unknown },
  previousState: TimelinePublicState | null,
) {
  const state = frame.state as TimelinePublicState | undefined;
  if (!state) return null;
  const checkpointState = shouldStoreTimelineCheckpoint(frame.index) ? state : undefined;
  const statePatch = checkpointState ? undefined : buildTimelineStatePatch(previousState, state);
  return { checkpointState, statePatch, state };
}

function needsCompactTimelinePatch(
  frame: { checkpointState?: unknown; statePatch?: unknown },
  desired: { checkpointState?: TimelinePublicState; statePatch?: unknown },
) {
  return !sameJson(frame.checkpointState, desired.checkpointState) ||
    !sameJson(frame.statePatch, desired.statePatch);
}

async function clearStaleTimelineFrameFieldsBatch(ctx: MutationCtx, args: {
  batchSize?: number;
}) {
  const batchSize = Math.max(1, Math.min(500, Math.floor(args.batchSize ?? 100)));
  const frames = await ctx.db.query("gameTimelineFrames").collect();
  const framesToPatch = frames
    .filter((frame) => hasRemovedTimelineFrameField(frame))
    .slice(0, batchSize);

  let patched = 0;
  for (const frame of framesToPatch) {
    await ctx.db.patch(frame._id, buildStaleTimelineFramePatch(frame));
    patched += 1;
  }

  const remaining = frames.filter((frame) => hasRemovedTimelineFrameField(frame)).length - patched;

  return {
    scanned: frames.length,
    patched,
    remaining,
    done: remaining === 0,
  };
}

export const clearRemovedTimelineFrameFields = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await clearStaleTimelineFrameFieldsBatch(ctx, args);
  },
});

export const clearStaleTimelineFrameFields = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await clearStaleTimelineFrameFieldsBatch(ctx, args);
  },
});

export const backfillCompactTimelineFrames = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    gameId: v.optional(v.id("games")),
  },
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(500, Math.floor(args.batchSize ?? 100)));
    let frames: Doc<"gameTimelineFrames">[];
    if (args.gameId) {
      const gameId = args.gameId;
      frames = await ctx.db
        .query("gameTimelineFrames")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId))
        .collect();
    } else {
      frames = await ctx.db.query("gameTimelineFrames").collect();
    }
    const sortedFrames = [...frames].sort((left, right) => {
      const gameCompare = String(left.gameId).localeCompare(String(right.gameId));
      return gameCompare || left.index - right.index;
    });

    let patched = 0;
    let scanned = 0;
    let missingState = 0;
    let previousGameId: string | null = null;
    let previousState: TimelinePublicState | null = null;

    for (const frame of sortedFrames) {
      scanned += 1;
      const gameId = String(frame.gameId);
      if (gameId !== previousGameId) {
        previousGameId = gameId;
        previousState = null;
      }

      const desired = buildDesiredCompactTimelineFields(frame, previousState);
      if (!desired) {
        missingState += 1;
        previousState = null;
        continue;
      }

      if (needsCompactTimelinePatch(frame, desired) && patched < batchSize) {
        await ctx.db.patch(frame._id, {
          checkpointState: desired.checkpointState,
          statePatch: desired.statePatch,
        });
        patched += 1;
      }

      previousState = desired.state;
    }

    let remaining = 0;
    previousGameId = null;
    previousState = null;
    for (const frame of sortedFrames) {
      const gameId = String(frame.gameId);
      if (gameId !== previousGameId) {
        previousGameId = gameId;
        previousState = null;
      }
      const desired = buildDesiredCompactTimelineFields(frame, previousState);
      if (!desired) {
        previousState = null;
        continue;
      }
      if (needsCompactTimelinePatch(frame, desired)) remaining += 1;
      previousState = desired.state;
    }
    remaining = Math.max(0, remaining - patched);

    return {
      scanned,
      patched,
      missingState,
      remaining,
      done: remaining === 0,
    };
  },
});

export const backfillGameStates = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    gameId: v.optional(v.id("games")),
  },
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(200, Math.floor(args.batchSize ?? 50)));
    const games = args.gameId
      ? [await ctx.db.get(args.gameId)].filter((game): game is Doc<"games"> => !!game)
      : await ctx.db.query("games").collect();

    let scanned = 0;
    let backfilled = 0;
    let skipped = 0;
    for (const game of games) {
      if (scanned >= batchSize) break;
      scanned += 1;

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
      remaining: Math.max(0, games.length - scanned),
      done: scanned >= games.length,
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
      : await ctx.db.query("games").collect();

    let scanned = 0;
    let inserted = 0;
    let skipped = 0;
    for (const game of games) {
      const initialState = readGameStateNullable(game.initialState);
      if (initialState && inserted < batchSize) {
        const result = await insertGameStateSnapshotIfMissing(ctx, {
          gameId: game._id,
          index: -1,
          state: initialState,
          createdAt: game.startedAt ?? game.createdAt,
        });
        if (result) inserted += 1;
      }

      const frames = await ctx.db
        .query("gameTimelineFrames")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", game._id))
        .collect();
      const sortedFrames = [...frames].sort((left, right) => left.index - right.index);
      let reconstructed: TimelinePublicState | null = null;

      for (const frame of sortedFrames) {
        scanned += 1;
        if (!shouldStoreGameStateSnapshot(frame.index)) continue;
        if (inserted >= batchSize) continue;

        let publicState = frame.checkpointState as TimelinePublicState | undefined;
        if (!publicState && frame.state) {
          publicState = frame.state as TimelinePublicState;
        } else if (!publicState && frame.statePatch && reconstructed) {
          publicState = applyTimelineStatePatch(reconstructed, frame.statePatch as any);
        }
        if (!publicState) {
          skipped += 1;
          continue;
        }

        const existing = await ctx.db
          .query("gameStateSnapshots")
          .withIndex("by_gameId_index", (q) => q.eq("gameId", game._id).eq("index", frame.index))
          .unique();
        if (!existing) {
          await ctx.db.insert("gameStateSnapshots", {
            gameId: game._id,
            index: frame.index,
            publicState,
            createdAt: frame.createdAt ?? game.startedAt ?? game.createdAt,
          });
          inserted += 1;
        }
        reconstructed = publicState;
      }

      const currentState = readGameStateNullable(game.state);
      const latestAction = await ctx.db
        .query("gameActions")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", game._id))
        .order("desc")
        .first();
      if (
        currentState &&
        latestAction &&
        shouldStoreGameStateSnapshot(latestAction.index) &&
        inserted < batchSize
      ) {
        const result = await insertGameStateSnapshotIfMissing(ctx, {
          gameId: game._id,
          index: latestAction.index,
          state: currentState,
          createdAt: latestAction.createdAt,
        });
        if (result) inserted += 1;
      }
    }

    return {
      scanned,
      inserted,
      skipped,
      interval: GAME_STATE_SNAPSHOT_INTERVAL,
      done: inserted < batchSize,
    };
  },
});

export const backfillGameActionPublicPatches = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    gameId: v.optional(v.id("games")),
  },
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(500, Math.floor(args.batchSize ?? 100)));
    const games = args.gameId
      ? [await ctx.db.get(args.gameId)].filter((game): game is Doc<"games"> => !!game)
      : await ctx.db.query("games").collect();

    let scanned = 0;
    let patched = 0;
    let missingFrameState = 0;

    for (const game of games) {
      const frames = await ctx.db
        .query("gameTimelineFrames")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", game._id))
        .collect();
      const sortedFrames = [...frames].sort((left, right) => left.index - right.index);
      let previousState: TimelinePublicState | null = null;
      const patchesByIndex = new Map<number, unknown>();

      for (const frame of sortedFrames) {
        let frameState = frame.checkpointState as TimelinePublicState | undefined;
        if (!frameState && frame.state) {
          frameState = frame.state as TimelinePublicState;
        } else if (!frameState && frame.statePatch && previousState) {
          frameState = applyTimelineStatePatch(previousState, frame.statePatch as any);
        }

        if (!frameState) {
          missingFrameState += 1;
          previousState = null;
          continue;
        }

        if (frame.index >= 0 && previousState) {
          patchesByIndex.set(frame.index, buildTimelineStatePatch(previousState, frameState));
        }
        previousState = frameState;
      }

      const actions = await ctx.db
        .query("gameActions")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", game._id))
        .collect();
      for (const action of actions) {
        scanned += 1;
        if (patched >= batchSize) continue;
        if (action.publicStatePatch) continue;
        const publicStatePatch = patchesByIndex.get(action.index);
        if (!publicStatePatch) continue;
        await ctx.db.patch(action._id, { publicStatePatch });
        patched += 1;
      }
    }

    return {
      scanned,
      patched,
      missingFrameState,
      done: patched < batchSize,
    };
  },
});
