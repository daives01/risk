import { rescheduleUserReminders } from "./turnReminders";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth.js";

const DEFAULT_EMAIL_TURN_NOTIFICATIONS_ENABLED = true;

export const getMySettings = query({
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const userId = String(user._id);
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    return {
      timeZone: settings?.timeZone ?? null,
      emailTurnNotificationsEnabled:
        settings?.emailTurnNotificationsEnabled ??
        DEFAULT_EMAIL_TURN_NOTIFICATIONS_ENABLED,
    };
  },
});

export const setEmailTurnNotificationsEnabled = mutation({
  args: {
    enabled: v.boolean(),
  },
  handler: async (ctx, { enabled }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const userId = String(user._id);
    const now = Date.now();
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        emailTurnNotificationsEnabled: enabled,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userSettings", {
        userId,
        emailTurnNotificationsEnabled: enabled,
        createdAt: now,
        updatedAt: now,
      });
    }

    await rescheduleUserReminders(ctx, userId);
    return {
      emailTurnNotificationsEnabled: enabled,
    };
  },
});

export const setTimeZone = mutation({
  args: { timeZone: v.string(), onlyIfUnset: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    try { new Intl.DateTimeFormat("en-US", { timeZone: args.timeZone }); } catch { throw new Error("Choose a valid timezone."); }
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const userId = String(user._id);
    const existing = await ctx.db.query("userSettings").withIndex("by_userId", q => q.eq("userId", userId)).unique();
    if (args.onlyIfUnset && existing?.timeZone) return;
    if (existing) await ctx.db.patch(existing._id, { timeZone: args.timeZone, updatedAt: Date.now() });
    else await ctx.db.insert("userSettings", { userId, timeZone: args.timeZone, emailTurnNotificationsEnabled: true, createdAt: Date.now(), updatedAt: Date.now() });
    await rescheduleUserReminders(ctx, userId);
  },
});
