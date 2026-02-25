import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authComponent } from "./auth.js";

export async function requireAdmin(ctx: any) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");

  const admin = await ctx.db
    .query("admins")
    .withIndex("by_userId", (q: any) => q.eq("userId", String(user._id)))
    .unique();

  if (!admin) {
    throw new Error("Admin access required");
  }

  return String(user._id);
}

export const isUserAdminById = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const admin = await ctx.db
      .query("admins")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return Boolean(admin);
  },
});

export async function requireAdminAction(ctx: any) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");

  const userId = String(user._id);
  const isAdmin = await ctx.runQuery((internal as any).adminAuth.isUserAdminById, {
    userId,
  });
  if (!isAdmin) {
    throw new Error("Admin access required");
  }

  return userId;
}
