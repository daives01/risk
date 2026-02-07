import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth.js";
import { components } from "./_generated/api.js";
import { validateAuthoredMap } from "risk-engine";
import type { GraphMap, MapVisual } from "risk-engine";
import {
  defaultMapPlayerLimits,
  resolveMapPlayerLimits,
  validateMapPlayerLimits,
} from "./mapPlayerLimits";

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

const anchorValidator = v.object({
  x: v.number(),
  y: v.number(),
});

const mapPlayerLimitsValidator = v.object({
  minPlayers: v.number(),
  maxPlayers: v.number(),
});

async function requireAdmin(ctx: any) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");

  const admin = await ctx.db
    .query("admins")
    .withIndex("by_userId", (q: any) => q.eq("userId", String(user._id)))
    .unique();

  if (!admin) {
    throw new Error("Admin access required");
  }

  return String(user._id);
}

function validateContinentAssignments(graphMap: GraphMap): string[] {
  const errors: string[] = [];
  const territories = Object.keys(graphMap.territories);
  const continents = graphMap.continents ?? {};

  for (const [continentId, continent] of Object.entries(continents)) {
    if (!Number.isInteger(continent.bonus) || continent.bonus <= 0) {
      errors.push(`Continent "${continentId}" bonus must be a positive integer`);
    }
  }

  const seenCounts = new Map<string, number>();
  for (const continent of Object.values(continents)) {
    for (const territoryId of continent.territoryIds) {
      seenCounts.set(territoryId, (seenCounts.get(territoryId) ?? 0) + 1);
    }
  }

  for (const territoryId of territories) {
    const count = seenCounts.get(territoryId) ?? 0;
    if (count === 0) {
      errors.push(`Territory "${territoryId}" is not assigned to any continent`);
    }
    if (count > 1) {
      errors.push(`Territory "${territoryId}" is assigned to multiple continents`);
    }
  }

  return errors;
}

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const listAdminMaps = query({
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const maps = await ctx.db.query("maps").collect();
    return Promise.all(
      maps.map(async (m) => ({
        ...m,
        playerLimits: resolveMapPlayerLimits(
          m.playerLimits,
          Object.keys(m.graphMap.territories).length,
        ),
        imageUrl: await ctx.storage.getUrl(m.visual.imageStorageId),
      })),
    );
  },
});

export const isCurrentUserAdmin = query({
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return false;

    const admin = await ctx.db
      .query("admins")
      .withIndex("by_userId", (q: any) => q.eq("userId", String(user._id)))
      .unique();

    return Boolean(admin);
  },
});

export const getDraft = query({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    await requireAdmin(ctx);

    const map = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", mapId))
      .unique();

    if (!map) return null;

    return {
      ...map,
      playerLimits: resolveMapPlayerLimits(
        map.playerLimits,
        Object.keys(map.graphMap.territories).length,
      ),
      imageUrl: await ctx.storage.getUrl(map.visual.imageStorageId),
    };
  },
});

export const createDraft = mutation({
  args: {
    mapId: v.string(),
    name: v.string(),
    graphMap: graphMapValidator,
    visual: v.object({
      imageStorageId: v.id("_storage"),
      imageWidth: v.number(),
      imageHeight: v.number(),
      territoryAnchors: v.record(v.string(), anchorValidator),
    }),
    playerLimits: v.optional(mapPlayerLimitsValidator),
  },
  handler: async (ctx, { mapId, name, graphMap, visual, playerLimits }) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const resolvedPlayerLimits = playerLimits ?? defaultMapPlayerLimits();
    const playerLimitsErrors = validateMapPlayerLimits(resolvedPlayerLimits);
    if (playerLimitsErrors.length > 0) {
      throw new Error(playerLimitsErrors.join(", "));
    }

    const existing = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", mapId))
      .unique();
    if (existing) {
      throw new Error(`Map with id "${mapId}" already exists`);
    }

    return await ctx.db.insert("maps", {
      mapId,
      name,
      graphMap,
      visual,
      playerLimits: resolvedPlayerLimits,
      authoring: {
        status: "draft",
        updatedAt: now,
      },
      createdAt: now,
    });
  },
});

export const saveGraph = mutation({
  args: {
    mapId: v.string(),
    name: v.optional(v.string()),
    graphMap: graphMapValidator,
    playerLimits: mapPlayerLimitsValidator,
  },
  handler: async (ctx, { mapId, name, graphMap, playerLimits }) => {
    await requireAdmin(ctx);
    const playerLimitsErrors = validateMapPlayerLimits(playerLimits);
    if (playerLimitsErrors.length > 0) {
      throw new Error(playerLimitsErrors.join(", "));
    }

    const map = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", mapId))
      .unique();
    if (!map) throw new Error("Map not found");

    await ctx.db.patch(map._id, {
      ...(name ? { name } : {}),
      graphMap,
      playerLimits,
      authoring: {
        status: "draft",
        updatedAt: Date.now(),
      },
    });
  },
});

export const saveAnchors = mutation({
  args: {
    mapId: v.string(),
    imageStorageId: v.optional(v.id("_storage")),
    imageWidth: v.optional(v.number()),
    imageHeight: v.optional(v.number()),
    territoryAnchors: v.record(v.string(), anchorValidator),
  },
  handler: async (
    ctx,
    { mapId, imageStorageId, imageWidth, imageHeight, territoryAnchors },
  ) => {
    await requireAdmin(ctx);

    const map = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", mapId))
      .unique();
    if (!map) throw new Error("Map not found");

    const visual: MapVisual = {
      imageStorageId: (imageStorageId ?? map.visual.imageStorageId) as string,
      imageWidth: imageWidth ?? map.visual.imageWidth,
      imageHeight: imageHeight ?? map.visual.imageHeight,
      territoryAnchors,
    };

    await ctx.db.patch(map._id, {
      visual: {
        imageStorageId: visual.imageStorageId as any,
        imageWidth: visual.imageWidth,
        imageHeight: visual.imageHeight,
        territoryAnchors: visual.territoryAnchors,
      },
      authoring: {
        status: "draft",
        updatedAt: Date.now(),
      },
    });
  },
});

export const publish = mutation({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    await requireAdmin(ctx);

    const map = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", mapId))
      .unique();
    if (!map) throw new Error("Map not found");

    const metadata = await ctx.storage.getMetadata(map.visual.imageStorageId);
    if (!metadata) {
      throw new Error("Referenced map image does not exist in storage");
    }

    const authoredValidation = validateAuthoredMap({
      graphMap: map.graphMap as unknown as GraphMap,
      visual: {
        imageStorageId: String(map.visual.imageStorageId),
        imageWidth: map.visual.imageWidth,
        imageHeight: map.visual.imageHeight,
        territoryAnchors: map.visual.territoryAnchors,
      },
    });

    const continentErrors = validateContinentAssignments(
      map.graphMap as unknown as GraphMap,
    );
    const playerLimits = resolveMapPlayerLimits(
      map.playerLimits,
      Object.keys(map.graphMap.territories).length,
    );
    const playerLimitsErrors = validateMapPlayerLimits(
      playerLimits,
      Object.keys(map.graphMap.territories).length,
    );

    const errors = [
      ...authoredValidation.errors,
      ...continentErrors,
      ...playerLimitsErrors,
    ];
    if (errors.length > 0) {
      throw new Error(`Map publish validation failed:\n${errors.join("\n")}`);
    }

    const now = Date.now();
    await ctx.db.patch(map._id, {
      playerLimits,
      authoring: {
        status: "published",
        updatedAt: now,
        publishedAt: now,
      },
    });

    return { publishedAt: now };
  },
});

export const backfillPlayerLimits = mutation({
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const maps = await ctx.db.query("maps").collect();
    let updated = 0;

    for (const map of maps) {
      if (map.playerLimits) continue;
      await ctx.db.patch(map._id, {
        playerLimits: defaultMapPlayerLimits(
          Object.keys(map.graphMap.territories).length,
        ),
      });
      updated += 1;
    }

    return { updated };
  },
});

export const makeAdmin = internalMutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const lookup = username.trim();
    if (!lookup) {
      throw new Error("username is required");
    }

    const byUsername = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "username", operator: "eq", value: lookup }],
    });

    const byDisplayUsername =
      byUsername ??
      (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "displayUsername", operator: "eq", value: lookup }],
      }));

    const byName =
      byDisplayUsername ??
      (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "name", operator: "eq", value: lookup }],
      }));

    const user = byName as
      | { _id?: string; userId?: string; username?: string | null; displayUsername?: string | null; name?: string | null }
      | null;

    if (!user) {
      throw new Error(`No user found for username "${lookup}"`);
    }

    const userId = String(user.userId ?? user._id);
    const existing = await ctx.db
      .query("admins")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .unique();

    if (existing) {
      return {
        userId,
        username: user.username ?? user.displayUsername ?? user.name ?? lookup,
        alreadyAdmin: true,
      };
    }

    await ctx.db.insert("admins", {
      userId,
      createdAt: Date.now(),
    });

    return {
      userId,
      username: user.username ?? user.displayUsername ?? user.name ?? lookup,
      alreadyAdmin: false,
    };
  },
});
