import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const graphMapValidator = v.object({
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
});

const visualValidator = v.object({
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

export const list = query({
  handler: async (ctx) => {
    const docs = await ctx.db
      .query("maps")
      .withIndex("by_authoringStatus", (q) => q.eq("authoring.status", "published"))
      .collect();

    return Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        imageUrl: await ctx.storage.getUrl(doc.visual.imageStorageId),
      })),
    );
  },
});

export const getByMapId = query({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    const doc = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", mapId))
      .unique();
    if (!doc || doc.authoring.status !== "published") return null;
    return {
      ...doc,
      imageUrl: await ctx.storage.getUrl(doc.visual.imageStorageId),
    };
  },
});

export const upsert = internalMutation({
  args: {
    mapId: v.string(),
    name: v.string(),
    graphMap: graphMapValidator,
    visual: visualValidator,
    authoringStatus: v.optional(v.union(v.literal("draft"), v.literal("published"))),
  },
  handler: async (ctx, { mapId, name, graphMap, visual, authoringStatus }) => {
    const now = Date.now();
    const authoring = {
      status: authoringStatus ?? "published",
      updatedAt: now,
      publishedAt: (authoringStatus ?? "published") === "published" ? now : undefined,
    } as const;
    const existing = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", mapId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        graphMap,
        visual,
        authoring,
        createdAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("maps", {
      mapId,
      name,
      graphMap,
      visual,
      authoring,
      createdAt: now,
    });
  },
});
