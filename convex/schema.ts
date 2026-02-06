import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const territoryInfo = v.object({
  name: v.optional(v.string()),
  continentId: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
});

const continentInfo = v.object({
  territoryIds: v.array(v.string()),
  bonus: v.number(),
});

const graphMap = v.object({
  territories: v.record(v.string(), territoryInfo),
  adjacency: v.record(v.string(), v.array(v.string())),
  continents: v.optional(v.record(v.string(), continentInfo)),
});

export default defineSchema({
  games: defineTable({
    name: v.string(),
    mapId: v.string(),
    status: v.union(
      v.literal("lobby"),
      v.literal("active"),
      v.literal("finished"),
    ),
    visibility: v.union(v.literal("public"), v.literal("unlisted")),
    maxPlayers: v.number(),
    createdBy: v.string(),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    state: v.optional(v.any()),
    stateVersion: v.optional(v.number()),
  }),
  gamePlayers: defineTable({
    gameId: v.id("games"),
    userId: v.string(),
    displayName: v.string(),
    role: v.union(v.literal("host"), v.literal("player")),
    joinedAt: v.number(),
    enginePlayerId: v.optional(v.string()),
  })
    .index("by_gameId", ["gameId"])
    .index("by_userId", ["userId"])
    .index("by_gameId_userId", ["gameId", "userId"]),
  gameInvites: defineTable({
    gameId: v.id("games"),
    code: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_gameId", ["gameId"])
    .index("by_code", ["code"]),
  gameActions: defineTable({
    gameId: v.id("games"),
    index: v.number(),
    playerId: v.string(),
    action: v.any(),
    events: v.any(),
    stateVersionBefore: v.optional(v.number()),
    stateVersionAfter: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_gameId", ["gameId"])
    .index("by_gameId_index", ["gameId", "index"])
    .index("by_gameId_playerId", ["gameId", "playerId"]),
  maps: defineTable({
    mapId: v.string(),
    name: v.string(),
    graphMap,
    createdAt: v.number(),
  }).index("by_mapId", ["mapId"]),
});
