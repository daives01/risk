import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { GameState, GraphMap, PlayerId, RulesetConfig } from "risk-engine";
import { internal, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { isAsyncTimingMode, type GameTimingMode } from "./gameTiming";
import { yourTurnEmailHtml } from "./emails";
import { readGameStateNullable } from "./typeAdapters";
import {
  getGameStateDoc,
} from "./gameState";
import { applyTimeoutPolicy, executeGameTransition, GameTransitionRejected } from "./gameTransition";

export function applyTimeoutTurnResolution(args: {
  state: GameState;
  playerId: PlayerId;
  graphMap: GraphMap;
  ruleset: RulesetConfig;
}) {
  const frames = applyTimeoutPolicy(args);
  if (!frames) return null;
  return {
    nextState: frames[frames.length - 1]!.afterState,
    actionLogs: frames.map((frame) => ({
      action: frame.action,
      events: [...frame.events],
      publicStatePatch: {},
      beforeVersion: frame.beforeState.stateVersion,
      afterVersion: frame.afterState.stateVersion,
    })),
  };
}

async function processExpiredTurnForGame(ctx: any, args: {
  gameId: Id<"games">;
  expectedPlayerId: string;
  expectedTurnStartedAt: number;
}) {
  try {
    await executeGameTransition(ctx, {
      gameId: args.gameId,
      source: { type: "system_timeout", playerId: args.expectedPlayerId as PlayerId },
      intent: {
        type: "timeout",
        expectedPlayerId: args.expectedPlayerId as PlayerId,
        expectedTurnStartedAt: args.expectedTurnStartedAt,
      },
    });
    return { processed: true as const };
  } catch (error) {
    if (error instanceof GameTransitionRejected) {
      const reason = error.reason === "no_timeout_resolution"
        ? "no_resolution"
        : error.reason === "map_missing"
          ? "map_missing"
          : error.reason === "state_missing" || error.reason === "game_over"
            ? "game_over"
            : error.reason === "timeout_player_changed"
              ? "player_changed"
            : "stale_or_inactive";
      return { processed: false as const, reason };
    }
    throw error;
  }
}

export const processExpiredTurn = internalMutation({
  args: {
    gameId: v.id("games"),
    expectedPlayerId: v.string(),
    expectedTurnStartedAt: v.number(),
  },
  handler: async (ctx, args) => await processExpiredTurnForGame(ctx, args),
});
export const sendYourTurnEmail = internalAction({
  args: {
    gameId: v.id("games"),
    expectedPlayerId: v.string(),
    turnStartedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.runQuery(internal.asyncTurns.getGameForNotification, {
      gameId: args.gameId,
    });
    if (!game) return { sent: false, reason: "game_not_found" };
    if (game.status !== "active") return { sent: false, reason: "not_active" };
    if (!isAsyncTimingMode((game.timingMode ?? "realtime") as GameTimingMode)) {
      return { sent: false, reason: "not_async" };
    }
    if (game.turnStartedAt !== args.turnStartedAt) {
      return { sent: false, reason: "stale_turn" };
    }

    const state = readGameStateNullable(game.state);
    if (!state || state.turn.currentPlayerId !== args.expectedPlayerId) {
      return { sent: false, reason: "player_mismatch" };
    }

    const targetPlayer = game.players.find(
      (player: { enginePlayerId?: string }) => player.enginePlayerId === args.expectedPlayerId,
    );
    if (!targetPlayer) return { sent: false, reason: "target_missing" };

    const settings = await ctx.runQuery(internal.asyncTurns.getUserTurnEmailSetting, {
      userId: targetPlayer.userId,
    });
    if (!settings.emailTurnNotificationsEnabled) {
      return { sent: false, reason: "disabled_by_user" };
    }

    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "userId", operator: "eq", value: targetPlayer.userId }],
    }) ?? await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "_id", operator: "eq", value: targetPlayer.userId }],
    });

    const email = (user as { email?: string | null } | null)?.email?.trim();
    if (!email) return { sent: false, reason: "email_missing" };

    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const siteUrl = env.SITE_URL ?? "http://localhost:5173";
    const gameUrl = `${siteUrl}/play/${game._id}`;
    const turnDeadlineLabel = game.turnDeadlineAt
      ? new Date(game.turnDeadlineAt).toUTCString()
      : null;

    await ctx.runAction(internal.sendEmail.sendEmail, {
      to: email,
      subject: `Your turn: ${game.name}`,
      html: yourTurnEmailHtml({
        gameName: game.name,
        gameUrl,
        turnDeadlineLabel,
      }),
    });

    return { sent: true };
  },
});

export const getGameForNotification = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;
    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();
    const gameState = await getGameStateDoc(ctx, gameId);

    return {
      ...game,
      state: gameState?.privateState,
      players,
    };
  },
});

export const getUserTurnEmailSetting = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return {
      emailTurnNotificationsEnabled:
        settings?.emailTurnNotificationsEnabled ?? true,
    };
  },
});
