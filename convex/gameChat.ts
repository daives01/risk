import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth.js";
import type { Id } from "./_generated/dataModel";

const CHAT_CHANNEL_VALIDATOR = v.union(v.literal("all"), v.literal("team"), v.literal("dm"));
const PUBLIC_CHAT_CHANNEL_VALIDATOR = v.union(v.literal("all"), v.literal("team"));
const MAX_CHAT_LENGTH = 300;
const DEFAULT_MESSAGE_LIMIT = 60;
const MAX_MESSAGE_LIMIT = 120;

export type ChatChannel = "all" | "team" | "dm";
type StoredChatChannel = ChatChannel | "global";

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
  if (args.channel === "all" || args.channel === "dm") {
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

async function getGameParticipantByEnginePlayerId(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
  enginePlayerId: string,
) {
  const players = await ctx.db
    .query("gamePlayers")
    .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
    .collect();
  return players.find((player) => player.enginePlayerId === enginePlayerId) ?? null;
}

export const listMessages = query({
  args: {
    gameId: v.id("games"),
    channel: PUBLIC_CHAT_CHANNEL_VALIDATOR,
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

    const messages = args.channel === "all"
      ? [
          ...await ctx.db
            .query("gameChatMessages")
            .withIndex("by_gameId_channel_createdAt", (q) => q.eq("gameId", args.gameId).eq("channel", "all"))
            .order("desc")
            .take(limit),
          ...await ctx.db
            .query("gameChatMessages")
            .withIndex("by_gameId_channel_createdAt", (q) => q.eq("gameId", args.gameId).eq("channel", "global"))
            .order("desc")
            .take(limit),
        ].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
      : await ctx.db
          .query("gameChatMessages")
          .withIndex("by_gameId_channel_teamId_createdAt", (q) =>
            q.eq("gameId", args.gameId).eq("channel", "team").eq("teamId", teamId!),
          )
          .order("desc")
          .take(limit);

    return messages.reverse().map((message) => ({
      _id: message._id,
      channel: message.channel === "global" ? "all" : message.channel,
      teamId: message.teamId ?? null,
      recipientUserId: message.recipientUserId ?? null,
      recipientDisplayName: message.recipientDisplayName ?? null,
      recipientEnginePlayerId: message.recipientEnginePlayerId ?? null,
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

function formatMessageForClient(message: {
  _id: Id<"gameChatMessages">;
  channel: StoredChatChannel;
  teamId?: string;
  recipientUserId?: string;
  recipientDisplayName?: string;
  recipientEnginePlayerId?: string;
  text: string;
  createdAt: number;
  editedAt?: number;
  senderUserId: string;
  senderDisplayName: string;
  senderEnginePlayerId?: string;
}, callerId: string) {
  return {
    _id: message._id,
    channel: message.channel === "global" ? "all" : message.channel,
    teamId: message.teamId ?? null,
    recipientUserId: message.recipientUserId ?? null,
    recipientDisplayName: message.recipientDisplayName ?? null,
    recipientEnginePlayerId: message.recipientEnginePlayerId ?? null,
    text: message.text,
    createdAt: message.createdAt,
    editedAt: message.editedAt ?? null,
    senderUserId: message.senderUserId,
    senderDisplayName: message.senderDisplayName,
    senderEnginePlayerId: message.senderEnginePlayerId ?? null,
    isMine: message.senderUserId === callerId,
  };
}

export const listVisibleMessages = query({
  args: {
    gameId: v.id("games"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { game, callerId, membership } = await getMembershipContext(ctx, args.gameId);
    const teamId =
      game.teamModeEnabled && membership.teamId
        ? membership.teamId
        : null;
    const limit = Math.max(1, Math.min(MAX_MESSAGE_LIMIT, Math.trunc(args.limit ?? DEFAULT_MESSAGE_LIMIT)));

    const allMessages = await ctx.db
      .query("gameChatMessages")
      .withIndex("by_gameId_channel_createdAt", (q) => q.eq("gameId", args.gameId).eq("channel", "all"))
      .order("desc")
      .take(limit);
    const legacyGlobalMessages = await ctx.db
      .query("gameChatMessages")
      .withIndex("by_gameId_channel_createdAt", (q) => q.eq("gameId", args.gameId).eq("channel", "global"))
      .order("desc")
      .take(limit);
    const teamMessages = teamId
      ? await ctx.db
          .query("gameChatMessages")
          .withIndex("by_gameId_channel_teamId_createdAt", (q) =>
            q.eq("gameId", args.gameId).eq("channel", "team").eq("teamId", teamId),
          )
          .order("desc")
          .take(limit)
      : [];
    const sentDmMessages = await ctx.db
      .query("gameChatMessages")
      .withIndex("by_gameId_channel_senderUserId_createdAt", (q) =>
        q.eq("gameId", args.gameId).eq("channel", "dm").eq("senderUserId", callerId),
      )
      .order("desc")
      .take(limit);
    const receivedDmMessages = await ctx.db
      .query("gameChatMessages")
      .withIndex("by_gameId_channel_recipientUserId_createdAt", (q) =>
        q.eq("gameId", args.gameId).eq("channel", "dm").eq("recipientUserId", callerId),
      )
      .order("desc")
      .take(limit);

    return [...allMessages, ...legacyGlobalMessages, ...teamMessages, ...sentDmMessages, ...receivedDmMessages]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .reverse()
      .map((message) => formatMessageForClient(message, callerId));
  },
});

export const sendMessage = mutation({
  args: {
    gameId: v.id("games"),
    channel: CHAT_CHANNEL_VALIDATOR,
    recipientEnginePlayerId: v.optional(v.string()),
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
    const recipient = args.channel === "dm"
      ? await getGameParticipantByEnginePlayerId(ctx, args.gameId, args.recipientEnginePlayerId ?? "")
      : null;
    if (args.channel === "dm") {
      if (!args.recipientEnginePlayerId) {
        throw new Error("Choose a player to message");
      }
      if (!recipient) {
        throw new Error("Message recipient is not in this game");
      }
      if (recipient.userId === callerId) {
        throw new Error("You cannot send a direct message to yourself");
      }
    }

    const text = normalizeChatMessage(args.text);
    await ctx.db.insert("gameChatMessages", {
      gameId: args.gameId,
      channel: args.channel,
      teamId: teamId ?? undefined,
      recipientUserId: recipient?.userId,
      recipientDisplayName: recipient?.displayName,
      recipientEnginePlayerId: recipient?.enginePlayerId,
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
