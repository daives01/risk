import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth.js";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const createGame = mutation({
  args: {
    name: v.string(),
    mapId: v.string(),
    visibility: v.optional(
      v.union(v.literal("public"), v.literal("unlisted")),
    ),
    maxPlayers: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Verify the map exists
    const map = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", args.mapId))
      .unique();
    if (!map) throw new Error("Map not found");

    const maxPlayers = args.maxPlayers ?? 6;
    if (maxPlayers < 2 || maxPlayers > 6) {
      throw new Error("maxPlayers must be between 2 and 6");
    }

    const gameId = await ctx.db.insert("games", {
      name: args.name,
      mapId: args.mapId,
      status: "lobby",
      visibility: args.visibility ?? "unlisted",
      maxPlayers,
      createdBy: String(user._id),
      createdAt: Date.now(),
    });

    // Add creator as host
    await ctx.db.insert("gamePlayers", {
      gameId,
      userId: String(user._id),
      displayName: user.name,
      role: "host",
      joinedAt: Date.now(),
    });

    // Generate invite code
    const code = generateInviteCode();
    await ctx.db.insert("gameInvites", {
      gameId,
      code,
      createdAt: Date.now(),
    });

    return { gameId, inviteCode: code };
  },
});

export const joinGameByInvite = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, { code }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const invite = await ctx.db
      .query("gameInvites")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
      .unique();
    if (!invite) throw new Error("Invalid invite code");

    if (invite.expiresAt && invite.expiresAt < Date.now()) {
      throw new Error("Invite code has expired");
    }

    const game = await ctx.db.get(invite.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    // Check if already joined
    const existing = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId_userId", (q) =>
        q.eq("gameId", invite.gameId).eq("userId", String(user._id)),
      )
      .unique();
    if (existing) throw new Error("Already in this game");

    // Check slot availability
    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", invite.gameId))
      .collect();
    if (players.length >= game.maxPlayers) {
      throw new Error("Game is full");
    }

    await ctx.db.insert("gamePlayers", {
      gameId: invite.gameId,
      userId: String(user._id),
      displayName: user.name,
      role: "player",
      joinedAt: Date.now(),
    });

    return { gameId: invite.gameId };
  },
});

export const kickPlayer = mutation({
  args: {
    gameId: v.id("games"),
    userId: v.string(),
  },
  handler: async (ctx, { gameId, userId }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");
    const callerId = String(user._id);
    if (game.createdBy !== callerId) throw new Error("Only the host can kick players");

    // Can't kick yourself (the host)
    if (userId === callerId) throw new Error("Cannot kick yourself");

    const playerDoc = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId_userId", (q) =>
        q.eq("gameId", gameId).eq("userId", userId),
      )
      .unique();
    if (!playerDoc) throw new Error("Player not in this game");

    await ctx.db.delete(playerDoc._id);
  },
});

export const getLobby = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;

    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();

    const invite = await ctx.db
      .query("gameInvites")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .first();

    return {
      game,
      players: players.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        role: p.role,
        joinedAt: p.joinedAt,
      })),
      inviteCode: invite?.code ?? null,
    };
  },
});
