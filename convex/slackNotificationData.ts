import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { readGameStateNullable } from "./typeAdapters";

export const getSlackNotificationContext = internalQuery({
  args: { gameId: v.id("games"), expectedPlayerId: v.string(), turnStartedAt: v.number() },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return { ok: false as const, reason: "game_not_found" };
    if (game.status !== "active") return { ok: false as const, reason: "not_active" };
    if (!game.slackNotificationsEnabled) return { ok: false as const, reason: "disabled" };
    if (!game.slackTeamId) return { ok: false as const, reason: "missing_team" };
    if (game.turnStartedAt !== args.turnStartedAt) return { ok: false as const, reason: "stale_turn" };

    const state = readGameStateNullable(game.state);
    if (!state || state.turn.currentPlayerId !== args.expectedPlayerId) {
      return { ok: false as const, reason: "player_mismatch" };
    }

    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .collect();
    const targetPlayer = players.find((player) => player.enginePlayerId === args.expectedPlayerId);
    if (!targetPlayer) return { ok: false as const, reason: "target_missing" };

    const workspace = await ctx.db
      .query("slackWorkspaces")
      .withIndex("by_teamId", (q) => q.eq("teamId", game.slackTeamId!))
      .unique();
    if (!workspace || workspace.status !== "active") {
      return { ok: false as const, reason: "workspace_unavailable" };
    }

    const identity = await ctx.db
      .query("userSlackIdentities")
      .withIndex("by_userId_teamId", (q) =>
        q.eq("userId", targetPlayer.userId).eq("teamId", workspace.teamId),
      )
      .unique();

    return {
      ok: true as const,
      gameId: String(game._id),
      gameName: game.name,
      channelId: workspace.defaultChannelId,
      workspaceTeamId: workspace.teamId,
      encryptedToken: {
        ciphertext: workspace.botTokenCiphertext,
        iv: workspace.botTokenIv,
        tag: workspace.botTokenTag,
      },
      targetDisplayName: targetPlayer.displayName,
      slackUserId: identity?.status === "active" ? identity.slackUserId : null,
    };
  },
});
