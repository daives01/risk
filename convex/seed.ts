import { internalAction, mutation } from "./_generated/server";
import { v } from "convex/values";
import { classicMap } from "risk-maps";
import { validateMap } from "risk-engine";
import type { GraphMap } from "risk-engine";
import { defaultMapPlayerLimits } from "./mapPlayerLimits";

interface MapDef {
  mapId: string;
  name: string;
  graphMap: GraphMap;
}

const MAPS: MapDef[] = [
  { mapId: "classic", name: "Classic Global Domination", graphMap: classicMap },
];

const CLASSIC_STARTER_ANCHORS: Record<string, { x: number; y: number }> = {
  "afghanistan": { x: 0.668152057409402, y: 0.36122067415437464 },
  "alaska": { x: 0.06402301267705118, y: 0.1361250323783727 },
  "alberta": { x: 0.14243005022868213, y: 0.22242652349407305 },
  "argentina": { x: 0.2603226462595517, y: 0.8203090186461415 },
  "brazil": { x: 0.32293546041948723, y: 0.6548236851665511 },
  "central-america": { x: 0.1548397971793, y: 0.43061774948452547 },
  "china": { x: 0.7809679387786551, y: 0.41905157026283363 },
  "congo": { x: 0.5429264290895309, y: 0.7553604737858721 },
  "east-africa": { x: 0.5976421315536188, y: 0.6583825095424563 },
  "eastern-australia": { x: 0.9552684754941513, y: 0.8514487319353117 },
  "eastern-us": { x: 0.2371953905788548, y: 0.3647794985302798 },
  "egypt": { x: 0.5553361760401488, y: 0.563183957486993 },
  "great-britain": { x: 0.4098036890738122, y: 0.2829265378844609 },
  "greenland": { x: 0.3409860014385677, y: 0.08363237283377147 },
  "iceland": { x: 0.4272901506860464, y: 0.1850588675470688 },
  "india": { x: 0.7166628863981809, y: 0.49823541262672366 },
  "indonesia": { x: 0.8385040382769743, y: 0.7117648751810338 },
  "irkutsk": { x: 0.7888650504745028, y: 0.24644858803143296 },
  "japan": { x: 0.9039372494711412, y: 0.33719860961701476 },
  "kamchatka": { x: 0.888707105486292, y: 0.12277944096872832 },
  "madagascar": { x: 0.6478451987629364, y: 0.8665737355329086 },
  "middle-east": { x: 0.6196412284206231, y: 0.5142501223182969 },
  "mongolia": { x: 0.8165049414099699, y: 0.32563243039532297 },
  "new-guinea": { x: 0.9186033140491441, y: 0.6521545668846223 },
  "north-africa": { x: 0.4622630739105149, y: 0.5854266098364003 },
  "northern-europe": { x: 0.4893388854391357, y: 0.3185147816435126 },
  "northwest-territory": { x: 0.14863492370399106, y: 0.115661792216918 },
  "ontario": { x: 0.21576037311869672, y: 0.23755152709167002 },
  "peru": { x: 0.22760604066246828, y: 0.6610516278243851 },
  "quebec": { x: 0.27611686965124715, y: 0.24555888193745665 },
  "scandinavia": { x: 0.500620473576061, y: 0.1841691614530925 },
  "siam": { x: 0.8074796709004296, y: 0.5445001295134908 },
  "siberia": { x: 0.7279444745351061, y: 0.12989708972053868 },
  "south-africa": { x: 0.5474390643443011, y: 0.879919326942553 },
  "southern-europe": { x: 0.5102098234924475, y: 0.4163824519809048 },
  "ukraine": { x: 0.5869246228235396, y: 0.29360301101217645 },
  "ural": { x: 0.6799977249531736, y: 0.22509564177600194 },
  "venezuela": { x: 0.24114394642677867, y: 0.5640736635809693 },
  "western-australia": { x: 0.8667080086192875, y: 0.8630149111570035 },
  "western-europe": { x: 0.41826488017650615, y: 0.45108098964598015 },
  "western-us": { x: 0.15991651184091638, y: 0.31228683898567855 },
  "yakutsk": { x: 0.8057874326798908, y: 0.1138823800289654 },
};

/**
 * Seeds a draft map with classic graph + starter anchors.
 *
 * Expected flow:
 * 1) Create draft map in /admin/maps and upload board image.
 * 2) Run this mutation for that mapId.
 * 3) Fine-tune territory positions in /admin/maps/:mapId.
 */
export const seedClassicDraft = mutation({
  args: { mapId: v.string() },
  handler: async (ctx, { mapId }) => {
    const map = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", mapId))
      .unique();

    if (!map) {
      throw new Error(
        `Map "${mapId}" not found. Create a draft in /admin/maps first (with an image), then seed it.`,
      );
    }

    const validation = validateMap(classicMap);
    if (!validation.valid) {
      throw new Error(
        `Classic map validation failed:\n${validation.errors.join("\n")}`,
      );
    }

    const now = Date.now();

    const graphMapForDb = JSON.parse(JSON.stringify(classicMap)) as {
      territories: Record<string, { name?: string; continentId?: string; tags?: string[] }>;
      adjacency: Record<string, string[]>;
      continents?: Record<string, { territoryIds: string[]; bonus: number }>;
    };

    await ctx.db.patch(map._id, {
      name: map.name?.trim() ? map.name : "Classic Global Domination",
      graphMap: graphMapForDb,
      playerLimits: defaultMapPlayerLimits(
        Object.keys(classicMap.territories).length,
      ),
      visual: {
        imageStorageId: map.visual.imageStorageId,
        imageWidth: map.visual.imageWidth,
        imageHeight: map.visual.imageHeight,
        territoryAnchors: CLASSIC_STARTER_ANCHORS,
      },
      authoring: {
        status: "draft",
        updatedAt: now,
      },
    });

    return {
      mapId,
      territoryCount: Object.keys(classicMap.territories).length,
      anchorCount: Object.keys(CLASSIC_STARTER_ANCHORS).length,
      next: `Open /admin/maps/${mapId} to tweak anchors and publish`,
    };
  },
});

export const seedMaps = internalAction({
  handler: async () => {
    const results: string[] = [];

    for (const { mapId, name, graphMap } of MAPS) {
      const validation = validateMap(graphMap);
      if (!validation.valid) {
        throw new Error(
          `Map "${mapId}" failed validation:\n${validation.errors.join("\n")}`,
        );
      }

      results.push(
        `Validated map "${mapId}" (${name}, ${Object.keys(graphMap.territories).length} territories)`,
      );
    }

    results.push(
      "No maps were inserted. Use /admin/maps to upload an image, author anchors/graph, and publish.",
    );
    return results;
  },
});
