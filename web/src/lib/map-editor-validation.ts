import type { Id } from "@backend/_generated/dataModel";
import type { GraphMap, MapVisual } from "risk-engine";
import { validateMap, validateVisual } from "risk-engine";

export type TerritoryInfo = { name?: string; tags?: string[] };
export type Anchor = { x: number; y: number };
export type EditorContinent = { territoryIds: string[]; bonus: number };
export type EditorGraphMap = {
  territories: Record<string, TerritoryInfo>;
  adjacency: Record<string, string[]>;
  continents?: Record<string, EditorContinent>;
};

function toGraphMapInput(graph: EditorGraphMap): GraphMap {
  return {
    territories: graph.territories,
    adjacency: graph.adjacency as unknown as GraphMap["adjacency"],
    continents: graph.continents as GraphMap["continents"],
  };
}

function toVisualInput(
  imageStorageId: Id<"_storage"> | null,
  imageWidth: number,
  imageHeight: number,
  nodeScale: number,
  territoryAnchors: Record<string, Anchor>,
): MapVisual {
  return {
    imageStorageId: imageStorageId ?? "missing",
    imageWidth,
    imageHeight,
    nodeScale,
    territoryAnchors,
  };
}

export function normalizeAdjacency(graph: EditorGraphMap): Record<string, string[]> {
  const territoryIds = new Set(Object.keys(graph.territories));
  const normalized: Record<string, string[]> = {};

  for (const territoryId of territoryIds) {
    normalized[territoryId] = [];
  }

  for (const [territoryId, neighbors] of Object.entries(graph.adjacency)) {
    if (!territoryIds.has(territoryId)) continue;
    for (const neighborId of neighbors) {
      if (!territoryIds.has(neighborId)) continue;
      if (!normalized[territoryId]!.includes(neighborId)) {
        normalized[territoryId]!.push(neighborId);
      }
      if (!normalized[neighborId]!.includes(territoryId)) {
        normalized[neighborId]!.push(territoryId);
      }
    }
  }

  return normalized;
}

function graphConnectedTerritories(graph: EditorGraphMap) {
  const territoryIds = Object.keys(graph.territories);
  if (territoryIds.length <= 1) return { disconnected: [] as string[] };

  const visited = new Set<string>();
  const queue: string[] = [territoryIds[0]!];
  visited.add(territoryIds[0]!);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of graph.adjacency[current] ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return {
    disconnected: territoryIds.filter((territoryId) => !visited.has(territoryId)),
  };
}

interface BuildValidationOptions {
  graphForPersist: EditorGraphMap;
  imageStorageId: Id<"_storage"> | null;
  imageWidth: number;
  imageHeight: number;
  nodeScale: number;
  anchors: Record<string, Anchor>;
  territories: Record<string, TerritoryInfo>;
  continents: Record<string, EditorContinent>;
  territoryToContinents: Record<string, string[]>;
}

export function buildMapEditorValidation({
  graphForPersist,
  imageStorageId,
  imageWidth,
  imageHeight,
  nodeScale,
  anchors,
  territories,
  continents,
  territoryToContinents,
}: BuildValidationOptions) {
  const graphInput = toGraphMapInput(graphForPersist);
  const visualInput = toVisualInput(imageStorageId, imageWidth, imageHeight, nodeScale, anchors);
  const mapValidation = validateMap(graphInput);
  const visualValidation = validateVisual(graphInput, visualInput);
  const connection = graphConnectedTerritories(graphForPersist);

  const continentErrors: string[] = [];
  for (const territoryId of Object.keys(territories)) {
    if ((territoryToContinents[territoryId] ?? []).length === 0) {
      continentErrors.push(`Territory "${territoryId}" has no continent assignment`);
    }
  }
  for (const [continentId, continent] of Object.entries(continents)) {
    const bonus = continent.bonus;
    if (!Number.isInteger(bonus) || bonus <= 0) {
      continentErrors.push(`Continent "${continentId}" bonus must be a positive integer`);
    }
  }

  return {
    errors: [...mapValidation.errors, ...visualValidation.errors, ...continentErrors],
    warnings:
      connection.disconnected.length > 0
        ? [`Disconnected territories: ${connection.disconnected.join(", ")}`]
        : [],
  };
}

export function useMapEditorValidation(options: BuildValidationOptions) {
  return buildMapEditorValidation(options);
}
