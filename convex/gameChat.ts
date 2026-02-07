import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth.js";
import type { Id } from "./_generated/dataModel";

const CHAT_CHANNEL_VALIDATOR = v.union(v.literal("global"), v.literal("team"));
const MAX_CHAT_LENGTH = 300;
const DEFAULT_MESSAGE_LIMIT = 60;
const MAX_MESSAGE_LIMIT = 120;

export type ChatChannel = "global" | "team";

export function normalizeChatMessage(text: string): string {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error("Message cannot be empty");
  }
  if (normalized.length > MAX_CHAT_LENGTH) {
    throw new Error(`Message cannot exceed ${MAX_CHAT_LENGTH} characters`);
  }
  return normalized;
}

export function resolveTeamChannelAccess(args: {
  channel: ChatChannel;
  teamModeEnabled: boolean;
  playerTeamId?: string | null;
}) {
  if (args.channel === "global") {
    return null;
  }
  if (!args.teamModeEnabled) {
    throw new Error("Team chat is unavailable in this game");
  }
  if (!args.playerTeamId) {
    throw new Error("You are not assigned to a team in this game");
  }
  return args.playerTeamId;
}

async function getMembershipContext(ctx: QueryCtx | MutationCtx, gameId: Id<"games">) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");

  const game = await ctx.db.get(gameId);
  if (!game) throw new Error("Game not found");
  if (game.status !== "active" && game.status !== "finished") {
    throw new Error("Chat is only available for active or finished games");
  }

  const callerId = String(user._id);
  const membership = await ctx.db
    .query("gamePlayers")
    .withIndex("by_gameId_userId", (q) => q.eq("gameId", game._id).eq("userId", callerId))
    .unique();
  if (!membership) {
    throw new Error("You are not a participant in this game");
  }

  return {
    game,
    callerId,
    membership,
  };
}

export const listMessages = query({
  args: {
    gameId: v.id("games"),
    channel: CHAT_CHANNEL_VALIDATOR,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { game, callerId, membership } = await getMembershipContext(ctx, args.gameId);
    const teamId = resolveTeamChannelAccess({
      channel: args.channel,
      teamModeEnabled: game.teamModeEnabled ?? false,
      playerTeamId: membership.teamId ?? null,
    });

    const limit = Math.max(1, Math.min(MAX_MESSAGE_LIMIT, Math.trunc(args.limit ?? DEFAULT_MESSAGE_LIMIT)));

    const messages = args.channel === "global"
      ? await ctx.db
          .query("gameChatMessages")
          .withIndex("by_gameId_channel_createdAt", (q) => q.eq("gameId", args.gameId).eq("channel", "global"))
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("gameChatMessages")
          .withIndex("by_gameId_channel_teamId_createdAt", (q) =>
            q.eq("gameId", args.gameId).eq("channel", "team").eq("teamId", teamId!),
          )
          .order("desc")
          .take(limit);

    return messages.reverse().map((message) => ({
      _id: message._id,
      channel: message.channel,
      teamId: message.teamId ?? null,
      text: message.text,
      createdAt: message.createdAt,
      editedAt: message.editedAt ?? null,
      senderUserId: message.senderUserId,
      senderDisplayName: message.senderDisplayName,
      senderEnginePlayerId: message.senderEnginePlayerId ?? null,
      isMine: message.senderUserId === callerId,
    }));
  },
});

export const sendMessage = mutation({
  args: {
    gameId: v.id("games"),
    channel: CHAT_CHANNEL_VALIDATOR,
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const { game, callerId, membership } = await getMembershipContext(ctx, args.gameId);
    if (game.status !== "active") {
      throw new Error("Chat messages can only be sent while the game is active");
    }

    const teamId = resolveTeamChannelAccess({
      channel: args.channel,
      teamModeEnabled: game.teamModeEnabled ?? false,
      playerTeamId: membership.teamId ?? null,
    });

    const text = normalizeChatMessage(args.text);
    await ctx.db.insert("gameChatMessages", {
      gameId: args.gameId,
      channel: args.channel,
      teamId: teamId ?? undefined,
      senderUserId: callerId,
      senderDisplayName: membership.displayName,
      senderEnginePlayerId: membership.enginePlayerId,
      text,
      createdAt: Date.now(),
    });
  },
});

async function getOwnedMessageForUpdate(ctx: MutationCtx, messageId: Id<"gameChatMessages">) {
  const message = await ctx.db.get(messageId);
  if (!message) throw new Error("Message not found");

  const { game, callerId } = await getMembershipContext(ctx, message.gameId);
  if (game.status !== "active") {
    throw new Error("Chat messages can only be edited while the game is active");
  }
  if (message.senderUserId !== callerId) {
    throw new Error("You can only modify your own messages");
  }

  return { message };
}

export const editMessage = mutation({
  args: {
    messageId: v.id("gameChatMessages"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await getOwnedMessageForUpdate(ctx, args.messageId);
    const text = normalizeChatMessage(args.text);

    await ctx.db.patch(args.messageId, {
      text,
      editedAt: Date.now(),
    });
  },
});

export const deleteMessage = mutation({
  args: {
    messageId: v.id("gameChatMessages"),
  },
  handler: async (ctx, args) => {
    await getOwnedMessageForUpdate(ctx, args.messageId);
    await ctx.db.delete(args.messageId);
  },
});
