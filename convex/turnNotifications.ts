import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const sendTurnNotifications: any = internalAction({
  args: {
    gameId: v.id("games"),
    expectedPlayerId: v.string(),
    turnStartedAt: v.number(),
  },
  returns: v.object({
    email: v.object({
      sent: v.boolean(),
      reason: v.optional(v.string()),
    }),
    slack: v.object({
      sent: v.boolean(),
      reason: v.optional(v.string()),
      providerTs: v.optional(v.union(v.string(), v.null())),
    }),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    email: { sent: boolean; reason?: string };
    slack: { sent: boolean; reason?: string; providerTs?: string | null };
  }> => {
    const [emailResult, slackResult]: any = await Promise.all([
      ctx.runAction((internal as any).asyncTurns.sendYourTurnEmail, args).catch((error) => ({
        sent: false,
        reason: error instanceof Error ? error.message : String(error),
      })),
      ctx.runAction((internal as any).slackNotifications.sendYourTurnSlack, args).catch((error) => ({
        sent: false,
        reason: error instanceof Error ? error.message : String(error),
      })),
    ]);

    return {
      email: emailResult,
      slack: slackResult,
    };
  },
});
