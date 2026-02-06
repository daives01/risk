import type { TerritoryId, ContinentId } from "./types.js";

// ── GraphMap type ─────────────────────────────────────────────────────

export interface TerritoryInfo {
  readonly name?: string;
  readonly continentId?: ContinentId;
  readonly tags?: readonly string[];
}

export interface ContinentInfo {
  readonly territoryIds: readonly TerritoryId[];
  readonly bonus: number;
}

export interface GraphMap {
  readonly territories: Record<string, TerritoryInfo>;
  readonly adjacency: Record<string, readonly TerritoryId[]>;
  readonly continents?: Record<string, ContinentInfo>;
}

// ── Validation ────────────────────────────────────────────────────────

export interface MapValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export function validateMap(map: GraphMap): MapValidationResult {
  const errors: string[] = [];
  const territoryIds = new Set(Object.keys(map.territories));

  // Check: every key in adjacency must exist in territories
  for (const id of Object.keys(map.adjacency)) {
    if (!territoryIds.has(id)) {
      errors.push(`Adjacency references unknown territory "${id}"`);
    }
  }

  // Check: every territory should have an adjacency entry
  for (const id of territoryIds) {
    if (!(id in map.adjacency)) {
      errors.push(`Territory "${id}" has no adjacency entry`);
    }
  }

  // Check: all adjacency targets exist, and adjacency is symmetric
  for (const [id, neighbors] of Object.entries(map.adjacency)) {
    for (const neighbor of neighbors) {
      if (!territoryIds.has(neighbor)) {
        errors.push(
          `Territory "${id}" is adjacent to unknown territory "${neighbor}"`,
        );
        continue;
      }
      // Symmetry: if A->B then B->A
      const reverseNeighbors = map.adjacency[neighbor];
      if (!reverseNeighbors || !reverseNeighbors.includes(id as TerritoryId)) {
        errors.push(
          `Adjacency is not symmetric: "${id}" -> "${neighbor}" but not "${neighbor}" -> "${id}"`,
        );
      }
    }
  }

  // Check: continent territory references
  if (map.continents) {
    for (const [continentId, info] of Object.entries(map.continents)) {
      for (const tid of info.territoryIds) {
        if (!territoryIds.has(tid)) {
          errors.push(
            `Continent "${continentId}" references unknown territory "${tid}"`,
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
