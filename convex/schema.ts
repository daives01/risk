import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { effectiveRulesetValidator, rulesetOverridesValidator } from "./rulesets";

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

const mapVisual = v.object({
  imageStorageId: v.id("_storage"),
  imageWidth: v.number(),
  imageHeight: v.number(),
  territoryAnchors: v.record(
    v.string(),
    v.object({
      x: v.number(),
      y: v.number(),
    }),
  ),
});

const mapAuthoring = v.object({
  status: v.union(v.literal("draft"), v.literal("published")),
  updatedAt: v.number(),
  publishedAt: v.optional(v.number()),
});

const mapPlayerLimits = v.object({
  minPlayers: v.number(),
  maxPlayers: v.number(),
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
    teamModeEnabled: v.optional(v.boolean()),
    teamAssignmentStrategy: v.optional(
      v.union(v.literal("manual"), v.literal("balancedRandom")),
    ),
    rulesetOverrides: v.optional(rulesetOverridesValidator),
    effectiveRuleset: v.optional(effectiveRulesetValidator),
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
    color: v.optional(v.string()),
    role: v.union(v.literal("host"), v.literal("player")),
    joinedAt: v.number(),
    enginePlayerId: v.optional(v.string()),
    teamId: v.optional(v.string()),
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
  gameChatMessages: defineTable({
    gameId: v.id("games"),
    channel: v.union(v.literal("global"), v.literal("team")),
    teamId: v.optional(v.string()),
    senderUserId: v.string(),
    senderDisplayName: v.string(),
    senderEnginePlayerId: v.optional(v.string()),
    text: v.string(),
    createdAt: v.number(),
  })
    .index("by_gameId_createdAt", ["gameId", "createdAt"])
    .index("by_gameId_channel_createdAt", ["gameId", "channel", "createdAt"])
    .index("by_gameId_channel_teamId_createdAt", ["gameId", "channel", "teamId", "createdAt"]),
  maps: defineTable({
    mapId: v.string(),
    name: v.string(),
    graphMap,
    visual: mapVisual,
    playerLimits: v.optional(mapPlayerLimits),
    authoring: mapAuthoring,
    createdAt: v.number(),
  })
    .index("by_mapId", ["mapId"])
    .index("by_authoringStatus", ["authoring.status"]),
  admins: defineTable({
    userId: v.string(),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),
});
