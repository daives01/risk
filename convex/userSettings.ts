import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth.js";

const DEFAULT_EMAIL_TURN_NOTIFICATIONS_ENABLED = false;

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

    return {
      emailTurnNotificationsEnabled: enabled,
    };
  },
});
