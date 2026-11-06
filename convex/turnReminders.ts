import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { readGameStateNullable } from "./typeAdapters";
import { getGameStateDoc } from "./gameState";
import { DEFAULT_TIME_ZONE, reminderTimes } from "./turnReminderTiming";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export async function scheduleTurnReminders(ctx: MutationCtx, gameId: Id<"games">, playerId: string, start: number, deadline: number) {
  const player = await ctx.db.query("gamePlayers").withIndex("by_gameId", q => q.eq("gameId", gameId)).filter(q => q.eq(q.field("enginePlayerId"), playerId)).first();
  if (!player) return [];
  const settings = await ctx.db.query("userSettings").withIndex("by_userId", q => q.eq("userId", player.userId)).unique();
  if (settings?.emailTurnNotificationsEnabled === false) return [];
  const timeZone = settings?.timeZone ?? DEFAULT_TIME_ZONE;
  const game = await ctx.db.get(gameId);
  const sent = game?.turnStartedAt === start ? game.turnReminderSentKinds ?? [] : [];
  const jobs = [];
  for (const reminder of reminderTimes(start, deadline, timeZone)) {
    if (sent.includes(reminder.kind) || reminder.at <= Date.now()) continue;
    jobs.push(await ctx.scheduler.runAt(reminder.at, internal.turnReminders.dispatch, { gameId, expectedPlayerId: playerId, turnStartedAt: start, kind: reminder.kind }));
  }
  return jobs;
}

export const dispatch = internalMutation({
  args: { gameId: v.id("games"), expectedPlayerId: v.string(), turnStartedAt: v.number(), kind: v.union(v.literal("morning"), v.literal("final")) },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game || game.status !== "active" || game.turnStartedAt !== args.turnStartedAt || !game.turnDeadlineAt || game.turnDeadlineAt <= Date.now()) return;
    if (game.turnReminderSentKinds?.includes(args.kind)) return;
    const state = readGameStateNullable((await getGameStateDoc(ctx, args.gameId))?.privateState);
    if (state?.turn.currentPlayerId !== args.expectedPlayerId) return;
    await ctx.db.patch(game._id, { turnReminderSentKinds: [...(game.turnReminderSentKinds ?? []), args.kind] });
    await ctx.scheduler.runAfter(0, internal.asyncTurns.sendYourTurnEmail, { ...args, reminder: true });
  },
});

export async function rescheduleUserReminders(ctx: MutationCtx, userId: string) {
  const seats = await ctx.db.query("gamePlayers").withIndex("by_userId", q => q.eq("userId", userId)).collect();
  for (const seat of seats) {
    const game = await ctx.db.get(seat.gameId);
    if (!game || game.status !== "active" || !game.turnStartedAt || !game.turnDeadlineAt) continue;
    const state = readGameStateNullable((await getGameStateDoc(ctx, game._id))?.privateState);
    if (state?.turn.currentPlayerId !== seat.enginePlayerId) continue;
    for (const job of game.turnReminderJobIds ?? []) await ctx.scheduler.cancel(job);
    await ctx.db.patch(game._id, { turnReminderJobIds: await scheduleTurnReminders(ctx, game._id, seat.enginePlayerId!, game.turnStartedAt, game.turnDeadlineAt) });
  }
}
