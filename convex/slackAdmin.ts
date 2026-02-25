import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { authComponent } from "./auth.js";
import { requireAdmin } from "./adminAuth";
import { normalizeChannelId, normalizeSlackUserId, normalizeTeamId } from "./slackValidation";

export const listWorkspaces = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const workspaces = await ctx.db.query("slackWorkspaces").collect();
    const sorted = [...workspaces].sort((a, b) => a.teamName.localeCompare(b.teamName));
    return Promise.all(
      sorted.map(async (workspace) => {
        const identityCount = await ctx.db
          .query("userSlackIdentities")
          .withIndex("by_teamId_slackUserId", (q) => q.eq("teamId", workspace.teamId))
          .collect();
        return {
          _id: workspace._id,
          teamId: workspace.teamId,
          teamName: workspace.teamName,
          defaultChannelId: workspace.defaultChannelId,
          status: workspace.status,
          keyVersion: workspace.keyVersion,
          installedByUserId: workspace.installedByUserId,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          mappedUsers: identityCount.length,
        };
      }),
    );
  },
});

export const listWorkspaceIdentities = query({
  args: { teamId: v.string() },
  handler: async (ctx, { teamId }) => {
    await requireAdmin(ctx);
    const normalizedTeamId = normalizeTeamId(teamId);
    return await ctx.db
      .query("userSlackIdentities")
      .withIndex("by_teamId_slackUserId", (q) => q.eq("teamId", normalizedTeamId))
      .collect();
  },
});

export const updateWorkspace = mutation({
  args: {
    teamId: v.string(),
    teamName: v.optional(v.string()),
    defaultChannelId: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("disabled"))),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const normalizedTeamId = normalizeTeamId(args.teamId);
    const workspace = await ctx.db
      .query("slackWorkspaces")
      .withIndex("by_teamId", (q) => q.eq("teamId", normalizedTeamId))
      .unique();
    if (!workspace) throw new Error("Slack workspace not found");
    await ctx.db.patch(workspace._id, {
      ...(args.teamName ? { teamName: args.teamName.trim() } : {}),
      ...(args.defaultChannelId
        ? { defaultChannelId: normalizeChannelId(args.defaultChannelId) }
        : {}),
      ...(args.status ? { status: args.status } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const upsertUserIdentity = mutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
    slackUserId: v.string(),
    status: v.optional(v.union(v.literal("active"), v.literal("unlinked"))),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const normalizedTeamId = normalizeTeamId(args.teamId);
    const normalizedSlackUserId = normalizeSlackUserId(args.slackUserId);
    const status = args.status ?? "active";
    const now = Date.now();
    const existing = await ctx.db
      .query("userSlackIdentities")
      .withIndex("by_userId_teamId", (q) => q.eq("userId", args.userId).eq("teamId", normalizedTeamId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        slackUserId: normalizedSlackUserId,
        status,
        updatedAt: now,
      });
      return;
    }
    await ctx.db.insert("userSlackIdentities", {
      userId: args.userId,
      teamId: normalizedTeamId,
      slackUserId: normalizedSlackUserId,
      status,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const removeUserIdentity = mutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const normalizedTeamId = normalizeTeamId(args.teamId);
    const existing = await ctx.db
      .query("userSlackIdentities")
      .withIndex("by_userId_teamId", (q) => q.eq("userId", args.userId).eq("teamId", normalizedTeamId))
      .unique();
    if (!existing) return;
    await ctx.db.delete(existing._id);
  },
});

export const listMyWorkspaceOptions = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const userId = String(user._id);

    const identities = await ctx.db
      .query("userSlackIdentities")
      .withIndex("by_userId_teamId", (q) => q.eq("userId", userId))
      .collect();
    const activeIdentities = identities.filter((identity) => identity.status === "active");

    const options = await Promise.all(
      activeIdentities.map(async (identity) => {
        const workspace = await ctx.db
          .query("slackWorkspaces")
          .withIndex("by_teamId", (q) => q.eq("teamId", identity.teamId))
          .unique();
        if (!workspace || workspace.status !== "active") return null;
        return {
          teamId: workspace.teamId,
          teamName: workspace.teamName,
          defaultChannelId: workspace.defaultChannelId,
          slackUserId: identity.slackUserId,
        };
      }),
    );

    return options
      .filter((option): option is NonNullable<typeof option> => option !== null)
      .sort((a, b) => a.teamName.localeCompare(b.teamName));
  },
});

export const searchUsersForMapping = query({
  args: {
    search: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { search, limit }) => {
    await requireAdmin(ctx);
    const trimmed = search.trim();
    if (trimmed.length < 2) return [];

    const pageSize = Math.min(Math.max(limit ?? 8, 1), 20);
    const paginationOpts = { numItems: pageSize, cursor: null };

    const [usernameMatches, emailMatches] = await Promise.all([
      ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: "user",
        where: [{ field: "username", operator: "starts_with", value: trimmed }],
        paginationOpts,
      }),
      ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: "user",
        where: [{ field: "email", operator: "starts_with", value: trimmed }],
        paginationOpts,
      }),
    ]);

    const merged = [...usernameMatches.page, ...emailMatches.page] as Array<{
      _id?: string;
      userId?: string;
      username?: string | null;
      name?: string | null;
      email?: string | null;
    }>;

    const deduped = new Map<string, {
      userId: string;
      username: string | null;
      name: string | null;
      email: string | null;
    }>();

    for (const user of merged) {
      const userId = String(user.userId ?? user._id);
      if (!userId || deduped.has(userId)) continue;
      deduped.set(userId, {
        userId,
        username: user.username ?? null,
        name: user.name ?? null,
        email: user.email ?? null,
      });
      if (deduped.size >= pageSize) break;
    }

    return Array.from(deduped.values());
  },
});

export const upsertWorkspaceSecret = internalMutation({
  args: {
    teamId: v.string(),
    teamName: v.string(),
    defaultChannelId: v.string(),
    botTokenCiphertext: v.string(),
    botTokenIv: v.string(),
    botTokenTag: v.string(),
    keyVersion: v.number(),
    installedByUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("slackWorkspaces")
      .withIndex("by_teamId", (q) => q.eq("teamId", args.teamId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        teamName: args.teamName,
        defaultChannelId: args.defaultChannelId,
        status: "active",
        botTokenCiphertext: args.botTokenCiphertext,
        botTokenIv: args.botTokenIv,
        botTokenTag: args.botTokenTag,
        keyVersion: args.keyVersion,
        installedByUserId: args.installedByUserId,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("slackWorkspaces", {
      teamId: args.teamId,
      teamName: args.teamName,
      defaultChannelId: args.defaultChannelId,
      status: "active",
      botTokenCiphertext: args.botTokenCiphertext,
      botTokenIv: args.botTokenIv,
      botTokenTag: args.botTokenTag,
      keyVersion: args.keyVersion,
      installedByUserId: args.installedByUserId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getWorkspaceSecret = internalQuery({
  args: { teamId: v.string() },
  handler: async (ctx, { teamId }) => {
    return await ctx.db
      .query("slackWorkspaces")
      .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
      .unique();
  },
});

export const disableWorkspaceInternal = internalMutation({
  args: { teamId: v.string() },
  handler: async (ctx, { teamId }) => {
    const workspace = await ctx.db
      .query("slackWorkspaces")
      .withIndex("by_teamId", (q) => q.eq("teamId", teamId))
      .unique();
    if (!workspace) return;
    await ctx.db.patch(workspace._id, {
      status: "disabled",
      updatedAt: Date.now(),
    });
  },
});
