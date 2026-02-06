import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { classicMap } from "risk-maps";
import { validateMap } from "risk-engine";
import type { GraphMap } from "risk-engine";

interface MapDef {
  mapId: string;
  name: string;
  graphMap: GraphMap;
}

const MAPS: MapDef[] = [
  { mapId: "classic", name: "Classic Risk", graphMap: classicMap },
];

export const seedMaps = internalAction({
  handler: async (ctx) => {
    const results: string[] = [];

    for (const { mapId, name, graphMap } of MAPS) {
      const validation = validateMap(graphMap);
      if (!validation.valid) {
        throw new Error(
          `Map "${mapId}" failed validation:\n${validation.errors.join("\n")}`,
        );
      }

      await ctx.runMutation(internal.maps.upsert, {
        mapId,
        name,
        graphMap: graphMap as any,
      });
      results.push(`Seeded map "${mapId}" (${Object.keys(graphMap.territories).length} territories)`);
    }

    return results;
  },
});
