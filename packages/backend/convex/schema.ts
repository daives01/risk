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
    status: v.union(
      v.literal("lobby"),
      v.literal("active"),
      v.literal("finished"),
    ),
    createdBy: v.string(),
    createdAt: v.number(),
  }),
  maps: defineTable({
    mapId: v.string(),
    name: v.string(),
    graphMap,
    createdAt: v.number(),
  }).index("by_mapId", ["mapId"]),
});
