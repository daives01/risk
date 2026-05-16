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
  nodeScale: v.optional(v.union(v.number(), v.null())),
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
    timingMode: v.union(
      v.literal("realtime"),
      v.literal("async_1d"),
      v.literal("async_3d"),
    ),
    excludeWeekends: v.optional(v.boolean()),
    maxPlayers: v.number(),
    teamModeEnabled: v.optional(v.boolean()),
    teamCount: v.optional(v.number()),
    teamNames: v.optional(v.record(v.string(), v.string())),
    teamAssignmentStrategy: v.optional(
      v.union(v.literal("manual"), v.literal("balancedRandom")),
    ),
    rulesetOverrides: v.optional(rulesetOverridesValidator),
    effectiveRuleset: v.optional(effectiveRulesetValidator),
    createdBy: v.string(),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    winningPlayerId: v.optional(v.string()),
    winningTeamId: v.optional(v.string()),
    initialState: v.optional(v.any()),
    state: v.optional(v.any()),
    stateVersion: v.optional(v.number()),
    turnStartedAt: v.optional(v.number()),
    turnDeadlineAt: v.optional(v.number()),
    turnTimeoutJobId: v.optional(v.id("_scheduled_functions")),
    slackTeamId: v.optional(v.string()),
    slackNotificationsEnabled: v.optional(v.boolean()),
  })
    .index("by_visibility_status_createdAt", [
      "visibility",
      "status",
      "createdAt",
    ])
    .index("by_status_timingMode_turnDeadlineAt", [
      "status",
      "timingMode",
      "turnDeadlineAt",
    ])
    .index("by_slackTeamId", ["slackTeamId"]),
  gamePlayers: defineTable({
    gameId: v.id("games"),
    userId: v.string(),
    displayName: v.string(),
    color: v.optional(v.string()),
    role: v.union(v.literal("host"), v.literal("player")),
    joinedAt: v.number(),
    enginePlayerId: v.optional(v.string()),
    teamId: v.optional(v.string()),
    allowTeammatesToAct: v.optional(v.boolean()),
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
    actingUserId: v.optional(v.string()),
    wasDelegated: v.optional(v.boolean()),
    stateVersionBefore: v.optional(v.number()),
    stateVersionAfter: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_gameId", ["gameId"])
    .index("by_gameId_index", ["gameId", "index"])
    .index("by_gameId_playerId", ["gameId", "playerId"]),
  gameTimelineFrames: defineTable({
    gameId: v.id("games"),
    index: v.number(),
    actionId: v.optional(v.id("gameActions")),
    projectionVersion: v.number(),
    actionType: v.string(),
    label: v.string(),
    actorId: v.union(v.string(), v.null()),
    events: v.optional(v.any()),
    turnRound: v.number(),
    turnPlayerId: v.string(),
    turnPhase: v.string(),
    hasCapture: v.boolean(),
    eliminatedPlayerIds: v.array(v.string()),
    state: v.any(),
    replayError: v.optional(v.union(v.string(), v.null())),
    createdAt: v.number(),
  }).index("by_gameId_index", ["gameId", "index"]),
  gameTimelineSnapshots: defineTable({
    gameId: v.id("games"),
    index: v.number(),
    projectionVersion: v.number(),
    state: v.any(),
    createdAt: v.number(),
  }).index("by_gameId_index", ["gameId", "index"]),
  gameHistoryBackfills: defineTable({
    gameId: v.id("games"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    cursorIndex: v.number(),
    targetIndex: v.number(),
    projectionVersion: v.number(),
    error: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_gameId", ["gameId"])
    .index("by_status_updatedAt", ["status", "updatedAt"]),
  gameChatMessages: defineTable({
    gameId: v.id("games"),
    channel: v.union(v.literal("all"), v.literal("global"), v.literal("team"), v.literal("dm")),
    teamId: v.optional(v.string()),
    recipientUserId: v.optional(v.string()),
    recipientDisplayName: v.optional(v.string()),
    recipientEnginePlayerId: v.optional(v.string()),
    senderUserId: v.string(),
    senderDisplayName: v.string(),
    senderEnginePlayerId: v.optional(v.string()),
    text: v.string(),
    createdAt: v.number(),
    editedAt: v.optional(v.number()),
  })
    .index("by_gameId_createdAt", ["gameId", "createdAt"])
    .index("by_gameId_channel_createdAt", ["gameId", "channel", "createdAt"])
    .index("by_gameId_channel_teamId_createdAt", ["gameId", "channel", "teamId", "createdAt"])
    .index("by_gameId_channel_senderUserId_createdAt", ["gameId", "channel", "senderUserId", "createdAt"])
    .index("by_gameId_channel_recipientUserId_createdAt", ["gameId", "channel", "recipientUserId", "createdAt"]),
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
  userSettings: defineTable({
    userId: v.string(),
    emailTurnNotificationsEnabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),
  slackWorkspaces: defineTable({
    teamId: v.string(),
    teamName: v.string(),
    defaultChannelId: v.string(),
    status: v.union(v.literal("active"), v.literal("disabled")),
    botTokenCiphertext: v.string(),
    botTokenIv: v.string(),
    botTokenTag: v.string(),
    keyVersion: v.number(),
    installedByUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_teamId", ["teamId"])
    .index("by_status", ["status"]),
  userSlackIdentities: defineTable({
    userId: v.string(),
    teamId: v.string(),
    slackUserId: v.string(),
    status: v.union(v.literal("active"), v.literal("unlinked")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_teamId", ["userId", "teamId"])
    .index("by_teamId_slackUserId", ["teamId", "slackUserId"]),
});
