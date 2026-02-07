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

export interface TerritoryAnchor {
  readonly x: number;
  readonly y: number;
}

export interface MapVisual {
  readonly imageStorageId: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly territoryAnchors: Record<string, TerritoryAnchor>;
}

export interface AuthoredMap {
  readonly graphMap: GraphMap;
  readonly visual: MapVisual;
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

export function validateVisual(
  map: GraphMap,
  visual: MapVisual,
): MapValidationResult {
  const errors: string[] = [];

  if (!visual.imageStorageId || visual.imageStorageId.trim().length === 0) {
    errors.push("Map image is required");
  }

  if (!Number.isFinite(visual.imageWidth) || visual.imageWidth <= 0) {
    errors.push("imageWidth must be a positive number");
  }
  if (!Number.isFinite(visual.imageHeight) || visual.imageHeight <= 0) {
    errors.push("imageHeight must be a positive number");
  }

  for (const territoryId of Object.keys(map.territories)) {
    const anchor = visual.territoryAnchors[territoryId];
    if (!anchor) {
      errors.push(`Missing anchor for territory "${territoryId}"`);
      continue;
    }

    if (!Number.isFinite(anchor.x) || anchor.x < 0 || anchor.x > 1) {
      errors.push(
        `Anchor x for territory "${territoryId}" must be between 0 and 1`,
      );
    }
    if (!Number.isFinite(anchor.y) || anchor.y < 0 || anchor.y > 1) {
      errors.push(
        `Anchor y for territory "${territoryId}" must be between 0 and 1`,
      );
    }
  }

  for (const territoryId of Object.keys(visual.territoryAnchors)) {
    if (!map.territories[territoryId]) {
      errors.push(`Anchor references unknown territory "${territoryId}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateAuthoredMap(authoredMap: AuthoredMap): MapValidationResult {
  const graphValidation = validateMap(authoredMap.graphMap);
  const visualValidation = validateVisual(authoredMap.graphMap, authoredMap.visual);
  const errors = [...graphValidation.errors, ...visualValidation.errors];
  return { valid: errors.length === 0, errors };
}
