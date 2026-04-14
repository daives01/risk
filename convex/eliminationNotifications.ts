import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal, components } from "./_generated/api";
import { eliminationEmailHtml } from "./emails";

export const sendEliminationNotifications = internalAction({
  args: {
    gameId: v.id("games"),
    eliminatedPlayerIds: v.array(v.string()),
    byPlayerId: v.optional(v.string()),
  },
  returns: v.object({
    results: v.array(v.object({
      playerId: v.string(),
      sent: v.boolean(),
      reason: v.optional(v.string()),
    })),
  }),
  handler: async (ctx, args) => {
    const game = await ctx.runQuery((internal as any).asyncTurns.getGameForNotification, {
      gameId: args.gameId,
    });
    if (!game) {
      return {
        results: args.eliminatedPlayerIds.map((playerId) => ({
          playerId,
          sent: false,
          reason: "game_not_found",
        })),
      };
    }

    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const siteUrl = env.SITE_URL ?? "http://localhost:5173";
    const gameUrl = `${siteUrl}/play/${game._id}`;
    const eliminatingPlayer = args.byPlayerId
      ? game.players.find(
        (player: { enginePlayerId?: string }) => player.enginePlayerId === args.byPlayerId,
      )
      : null;
    const eliminatedByName = eliminatingPlayer?.displayName ?? null;

    const results = await Promise.all(args.eliminatedPlayerIds.map(async (playerId) => {
      const targetPlayer = game.players.find(
        (player: { enginePlayerId?: string }) => player.enginePlayerId === playerId,
      );
      if (!targetPlayer) return { playerId, sent: false, reason: "target_missing" };

      const settings = await ctx.runQuery((internal as any).asyncTurns.getUserTurnEmailSetting, {
        userId: targetPlayer.userId,
      });
      if (!settings.emailTurnNotificationsEnabled) {
        return { playerId, sent: false, reason: "disabled_by_user" };
      }

      const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "userId", operator: "eq", value: targetPlayer.userId }],
      }) ?? await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "_id", operator: "eq", value: targetPlayer.userId }],
      });

      const email = (user as { email?: string | null } | null)?.email?.trim();
      if (!email) return { playerId, sent: false, reason: "email_missing" };

      await ctx.runAction(internal.sendEmail.sendEmail, {
        to: email,
        subject: `Eliminated: ${game.name}`,
        html: eliminationEmailHtml({
          gameName: game.name,
          gameUrl,
          eliminatedByName:
            args.byPlayerId && args.byPlayerId === playerId
              ? null
              : eliminatedByName,
        }),
      });

      return { playerId, sent: true };
    }));

    return { results };
  },
});
