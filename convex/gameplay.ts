import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { authComponent } from "./auth.js";
import type { Action, GameState, PlayerId } from "risk-engine";
import { GAME_STATE_SNAPSHOT_INTERVAL, readCurrentPrivateGameState } from "./gameState";
import { executeGameTransition } from "./gameTransition";
export { resolveTurnTimingPatch } from "./gameplayTiming";

const actionValidator = v.union(
  v.object({
    type: v.literal("TradeCards"),
    cardIds: v.array(v.string()),
  }),
  v.object({
    type: v.literal("PlaceReinforcements"),
    territoryId: v.string(),
    count: v.number(),
  }),
  v.object({
    type: v.literal("Attack"),
    from: v.string(),
    to: v.string(),
    attackerDice: v.optional(v.number()),
  }),
  v.object({
    type: v.literal("Occupy"),
    moveArmies: v.number(),
  }),
  v.object({
    type: v.literal("Fortify"),
    from: v.string(),
    to: v.string(),
    count: v.number(),
  }),
  v.object({
    type: v.literal("EndAttackPhase"),
  }),
  v.object({
    type: v.literal("EndTurn"),
  }),
);


type DelegationPlayerDoc = {
  enginePlayerId?: string;
  teamId?: string;
  allowTeammatesToAct?: boolean;
};

export function resolveActingPlayerFromDocs(args: {
  requestedPlayerId?: string;
  callerId: string;
  callerPlayer: DelegationPlayerDoc | null;
  targetPlayer?: DelegationPlayerDoc | null;
  targetAllowsDelegation?: boolean;
  game: { teamModeEnabled?: boolean };
  state: GameState;
}) {
  if (!args.callerPlayer?.enginePlayerId) {
    throw new Error("You are not a player in this game");
  }

  const requestedPlayerId = args.requestedPlayerId ?? args.callerPlayer.enginePlayerId;
  if (requestedPlayerId === args.callerPlayer.enginePlayerId) {
    return {
      playerId: args.callerPlayer.enginePlayerId as PlayerId,
      actingUserId: args.callerId,
      wasDelegated: false,
    };
  }

  if (!args.game.teamModeEnabled) throw new Error("Turn delegation is only available in team games");
  if (args.state.turn.currentPlayerId !== requestedPlayerId) {
    throw new Error("You can only play for the active turn owner");
  }
  if (args.state.players[requestedPlayerId]?.status !== "alive") {
    throw new Error("You can only play for an alive teammate");
  }
  if (!args.callerPlayer.teamId) throw new Error("You are not assigned to a team");
  if (!args.targetPlayer?.enginePlayerId) {
    throw new Error("Delegated player not found");
  }
  if (args.targetAllowsDelegation !== true) {
    throw new Error("This teammate has not allowed delegated turns");
  }
  if (!args.targetPlayer.teamId || args.targetPlayer.teamId !== args.callerPlayer.teamId) {
    throw new Error("You can only play for a teammate");
  }

  return {
    playerId: args.targetPlayer.enginePlayerId as PlayerId,
    actingUserId: args.callerId,
    wasDelegated: true,
  };
}

async function resolveActingPlayer(ctx: MutationCtx, args: {
  gameId: Id<"games">;
  requestedPlayerId?: string;
  callerId: string;
  game: { teamModeEnabled?: boolean };
  state: GameState;
}) {
  const callerPlayer = await ctx.db
    .query("gamePlayers")
    .withIndex("by_gameId_userId", (q) =>
      q.eq("gameId", args.gameId).eq("userId", args.callerId),
    )
    .unique();
  const requestedPlayerId = args.requestedPlayerId ?? callerPlayer?.enginePlayerId;
  const targetPlayer = requestedPlayerId && requestedPlayerId !== callerPlayer?.enginePlayerId
    ? await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .filter((q) => q.eq(q.field("enginePlayerId"), requestedPlayerId))
      .unique()
    : null;
  return resolveActingPlayerFromDocs({
    requestedPlayerId: args.requestedPlayerId,
    callerId: args.callerId,
    callerPlayer,
    targetPlayer,
    targetAllowsDelegation: targetPlayer?.allowTeammatesToAct ?? false,
    game: args.game,
    state: args.state,
  });
}

export const submitAction = mutation({
  args: {
    gameId: v.id("games"),
    expectedVersion: v.number(),
    action: actionValidator,
    delegatedPlayerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    const state = await readCurrentPrivateGameState(ctx, game);
    if (!state) throw new Error("Game has no state");
    const acting = await resolveActingPlayer(ctx, {
      gameId: args.gameId,
      requestedPlayerId: args.delegatedPlayerId,
      callerId: String(user._id),
      game,
      state,
    });
    const result = await executeGameTransition(ctx, {
      gameId: args.gameId,
      source: { type: "user", ...acting },
      intent: { type: "action", action: args.action as Action, expectedVersion: args.expectedVersion },
    });
    return { events: result.events, newVersion: result.newVersion };
  },
});

export const submitReinforcementPlacements = mutation({
  args: {
    gameId: v.id("games"),
    expectedVersion: v.number(),
    delegatedPlayerId: v.optional(v.string()),
    placements: v.array(v.object({ territoryId: v.string(), count: v.number() })),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    const state = await readCurrentPrivateGameState(ctx, game);
    if (!state) throw new Error("Game has no state");
    const acting = await resolveActingPlayer(ctx, {
      gameId: args.gameId,
      requestedPlayerId: args.delegatedPlayerId,
      callerId: String(user._id),
      game,
      state,
    });
    const result = await executeGameTransition(ctx, {
      gameId: args.gameId,
      source: { type: "user", ...acting },
      intent: { type: "reinforcement_batch", placements: args.placements, expectedVersion: args.expectedVersion },
    });
    return { events: result.events, newVersion: result.newVersion };
  },
});

export const resign = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    const state = await readCurrentPrivateGameState(ctx, game);
    if (!state) throw new Error("Game has no state");
    const player = await ctx.db.query("gamePlayers")
      .withIndex("by_gameId_userId", (q) => q.eq("gameId", gameId).eq("userId", String(user._id)))
      .unique();
    if (!player?.enginePlayerId) throw new Error("You are not a player in this game");
    if (state.players[player.enginePlayerId]?.status !== "alive") throw new Error("You have already been eliminated");
    const result = await executeGameTransition(ctx, {
      gameId,
      source: { type: "user", playerId: player.enginePlayerId as PlayerId, actingUserId: String(user._id), wasDelegated: false },
      intent: { type: "resign" },
    });
    return { events: result.events, newVersion: result.newVersion };
  },
});
type RawEvent = Record<string, unknown>;
const MAX_HISTORY_WINDOW_ACTIONS = 100;

function redactEvents(events: RawEvent[]): RawEvent[] {
  return events.map((e) => {
    switch (e.type) {
      case "CardDrawn":
        return { type: e.type, playerId: e.playerId };
      case "CardsTraded":
        return { type: e.type, playerId: e.playerId, value: e.value, tradesCompletedAfter: e.tradesCompletedAfter };
      case "PlayerEliminated":
        return { type: e.type, eliminatedId: e.eliminatedId, byId: e.byId, cardsTransferredCount: Array.isArray(e.cardsTransferred) ? e.cardsTransferred.length : 0 };
      default:
        return e;
    }
  });
}

function redactAction(action: Record<string, unknown>): Record<string, unknown> {
  if (action.type === "TradeCards") {
    return { type: action.type };
  }
  return action;
}

export const getHistorySummary = query({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, { gameId }) => {
    const latestAction = await ctx.db
      .query("gameActions")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId))
      .order("desc")
      .first();

    return {
      latestActionIndex: latestAction?.index ?? null,
    };
  },
});

export const getHistoryWindow = query({
  args: {
    gameId: v.id("games"),
    beforeIndex: v.optional(v.number()),
  },
  handler: async (ctx, { gameId, beforeIndex }) => {
    if (typeof beforeIndex === "number" && beforeIndex <= 0) {
      const startSnapshot = await ctx.db
        .query("gameStateSnapshots")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId).eq("index", -1))
        .unique();
      const latestAction = await ctx.db
        .query("gameActions")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId))
        .order("desc")
        .first();
      return {
        latestIndex: latestAction?.index ?? -1,
        snapshotIndex: startSnapshot?.index ?? null,
        snapshotPublicState: startSnapshot?.publicState ?? null,
        actions: [],
        hasPrevious: false,
      };
    }

    const latestAction = await ctx.db
      .query("gameActions")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId))
      .order("desc")
      .first();
    const latestIndex = latestAction?.index ?? -1;
    if (latestIndex < 0) {
      const startSnapshot = await ctx.db
        .query("gameStateSnapshots")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId).eq("index", -1))
        .unique();
      return {
        latestIndex,
        snapshotIndex: startSnapshot?.index ?? null,
        snapshotPublicState: startSnapshot?.publicState ?? null,
        actions: [],
        hasPrevious: false,
      };
    }

    const rawWindowEnd =
      typeof beforeIndex === "number" && Number.isFinite(beforeIndex)
        ? Math.min(latestIndex, Math.floor(beforeIndex) - 1)
        : latestIndex;
    const windowEnd = Math.max(0, rawWindowEnd);
    const targetSnapshotIndex =
      Math.floor(windowEnd / GAME_STATE_SNAPSHOT_INTERVAL) * GAME_STATE_SNAPSHOT_INTERVAL;

    let snapshot = await ctx.db
      .query("gameStateSnapshots")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId).eq("index", targetSnapshotIndex))
      .unique();
    if (!snapshot) {
      snapshot = await ctx.db
        .query("gameStateSnapshots")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId).eq("index", -1))
        .unique();
    }

    const snapshotIndex = snapshot?.index ?? -1;
    const actions = await ctx.db
      .query("gameActions")
      .withIndex("by_gameId_index", (q) =>
        q.eq("gameId", gameId).gt("index", snapshotIndex).lte("index", windowEnd),
      )
      .take(MAX_HISTORY_WINDOW_ACTIONS);

    return {
      latestIndex,
      snapshotIndex,
      snapshotPublicState: snapshot?.publicState ?? null,
      actions: actions.map((a) => ({
        _id: a._id,
        _creationTime: a._creationTime,
        gameId: a.gameId,
        index: a.index,
        playerId: a.playerId,
        action: redactAction(a.action as Record<string, unknown>),
        events: redactEvents(a.events as RawEvent[]),
        publicStatePatch: a.publicStatePatch,
        createdAt: a.createdAt,
      })),
      hasPrevious: snapshotIndex > -1,
    };
  },
});
