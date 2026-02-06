import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db
      .query("maps")
      .collect();
  },
});

export const getByMapId = query({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    return await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", mapId))
      .unique();
  },
});

export const upsert = internalMutation({
  args: {
    mapId: v.string(),
    name: v.string(),
    graphMap: v.object({
      territories: v.record(
        v.string(),
        v.object({
          name: v.optional(v.string()),
          continentId: v.optional(v.string()),
          tags: v.optional(v.array(v.string())),
        }),
      ),
      adjacency: v.record(v.string(), v.array(v.string())),
      continents: v.optional(
        v.record(
          v.string(),
          v.object({
            territoryIds: v.array(v.string()),
            bonus: v.number(),
          }),
        ),
      ),
    }),
  },
  handler: async (ctx, { mapId, name, graphMap }) => {
    const existing = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", mapId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { name, graphMap, createdAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("maps", {
      mapId,
      name,
      graphMap,
      createdAt: Date.now(),
    });
  },
});
