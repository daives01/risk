import { internalAction } from "./_generated/server";
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
