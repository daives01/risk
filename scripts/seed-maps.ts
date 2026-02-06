#!/usr/bin/env bun
/**
 * CLI seed script for maps.
 *
 * Validates all predefined maps locally using risk-engine, then calls the
 * Convex internal action `seed:seedMaps` to upsert them into the database.
 *
 * Usage:
 *   bun scripts/seed-maps.ts
 *   # or from repo root:
 *   npx convex run seed:seedMaps
 */

import { classicMap } from "risk-maps";
import { validateMap } from "risk-engine";
import type { GraphMap } from "risk-engine";

interface MapDef {
  id: string;
  name: string;
  graphMap: GraphMap;
}

const maps: MapDef[] = [
  { id: "classic", name: "Classic Risk", graphMap: classicMap },
];

console.log("Validating maps...\n");

let allValid = true;
for (const { id, name, graphMap } of maps) {
  const result = validateMap(graphMap);
  const territories = Object.keys(graphMap.territories).length;
  const continents = graphMap.continents ? Object.keys(graphMap.continents).length : 0;

  if (result.valid) {
    console.log(`  ✓ ${name} (${id}): ${territories} territories, ${continents} continents`);
  } else {
    console.error(`  ✗ ${name} (${id}): FAILED`);
    for (const err of result.errors) {
      console.error(`    - ${err}`);
    }
    allValid = false;
  }
}

if (!allValid) {
  console.error("\nValidation failed. Fix errors before seeding.");
  process.exit(1);
}

console.log("\nAll maps valid. To seed into Convex, run:");
console.log("  npx convex run seed:seedMaps");
