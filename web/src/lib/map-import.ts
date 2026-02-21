import type { Anchor, EditorContinent, EditorGraphMap, TerritoryInfo } from "./map-editor-validation";

export interface MapImportJson {
  territories: Array<{
    id: string;
    name?: string;
    tags?: string[];
    x?: number;
    y?: number;
  }>;
  adjacency: Record<string, string[]>;
  continents: Array<{
    id: string;
    bonus: number;
    territoryIds: string[];
  }>;
  playerLimits?: {
    minPlayers: number;
    maxPlayers: number;
  };
}

export interface ParsedMapImport {
  graphMap: EditorGraphMap;
  anchors: Record<string, Anchor>;
  playerLimits: { minPlayers: number; maxPlayers: number } | null;
  warnings: string[];
}

export interface MapImportParseResult {
  value: ParsedMapImport | null;
  errors: string[];
}

export function buildMapExportJson(args: {
  graphMap: EditorGraphMap;
  anchors: Record<string, Anchor>;
  playerLimits: { minPlayers: number; maxPlayers: number };
}): MapImportJson {
  const territoryIds = Object.keys(args.graphMap.territories).sort();
  const territories = territoryIds.map((territoryId) => {
    const info = args.graphMap.territories[territoryId] ?? {};
    const anchor = args.anchors[territoryId];
    return {
      id: territoryId,
      ...(info.name ? { name: info.name } : {}),
      ...(Array.isArray(info.tags) && info.tags.length > 0 ? { tags: [...info.tags] } : {}),
      ...(anchor ? { x: anchor.x, y: anchor.y } : {}),
    };
  });

  const adjacency = Object.fromEntries(
    territoryIds.map((territoryId) => [
      territoryId,
      [...(args.graphMap.adjacency[territoryId] ?? [])].sort(),
    ]),
  );

  const continentIds = Object.keys(args.graphMap.continents ?? {}).sort();
  const continents = continentIds.map((continentId) => {
    const continent = args.graphMap.continents?.[continentId];
    return {
      id: continentId,
      bonus: Math.max(1, Math.floor(continent?.bonus ?? 1)),
      territoryIds: [...new Set(continent?.territoryIds ?? [])].sort(),
    };
  });

  return {
    territories,
    adjacency,
    continents,
    playerLimits: {
      minPlayers: args.playerLimits.minPlayers,
      maxPlayers: args.playerLimits.maxPlayers,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatPath(path: string[]): string {
  return path.join(".");
}

function ensureString(value: unknown, path: string[], errors: string[]): string {
  if (typeof value !== "string") {
    errors.push(`${formatPath(path)} must be a string`);
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    errors.push(`${formatPath(path)} must not be empty`);
  }
  return trimmed;
}

function ensureInteger(value: unknown, path: string[], errors: string[]): number {
  if (!Number.isInteger(value)) {
    errors.push(`${formatPath(path)} must be an integer`);
    return 0;
  }
  return value as number;
}

export function parseMapImportJson(input: string): MapImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    return {
      value: null,
      errors: [
        error instanceof Error
          ? `Invalid JSON: ${error.message}`
          : "Invalid JSON",
      ],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(parsed)) {
    return { value: null, errors: ["Root must be a JSON object"] };
  }

  const territoriesRaw = parsed.territories;
  if (!Array.isArray(territoriesRaw)) {
    errors.push("territories must be an array");
  }

  const adjacencyRaw = parsed.adjacency;
  if (!isRecord(adjacencyRaw)) {
    errors.push("adjacency must be an object");
  }

  const continentsRaw = parsed.continents;
  if (!Array.isArray(continentsRaw)) {
    errors.push("continents must be an array");
  }

  const territoryIds = new Set<string>();
  const territories: Record<string, TerritoryInfo> = {};
  const anchors: Record<string, Anchor> = {};

  if (Array.isArray(territoriesRaw)) {
    for (const [index, territory] of territoriesRaw.entries()) {
      const path = ["territories", String(index)];
      if (!isRecord(territory)) {
        errors.push(`${formatPath(path)} must be an object`);
        continue;
      }

      const id = ensureString(territory.id, [...path, "id"], errors);
      if (!id) continue;
      if (territoryIds.has(id)) {
        errors.push(`${formatPath([...path, "id"])} duplicates territory id "${id}"`);
        continue;
      }
      territoryIds.add(id);

      if (territory.name !== undefined && typeof territory.name !== "string") {
        errors.push(`${formatPath([...path, "name"])} must be a string`);
      }

      if (territory.tags !== undefined) {
        if (!Array.isArray(territory.tags) || territory.tags.some((tag) => typeof tag !== "string")) {
          errors.push(`${formatPath([...path, "tags"])} must be an array of strings`);
        }
      }

      const info: TerritoryInfo = {};
      if (typeof territory.name === "string" && territory.name.trim()) {
        info.name = territory.name.trim();
      }
      if (Array.isArray(territory.tags)) {
        info.tags = territory.tags.filter((tag): tag is string => typeof tag === "string");
      }
      territories[id] = info;

      const hasX = territory.x !== undefined;
      const hasY = territory.y !== undefined;
      if (hasX !== hasY) {
        errors.push(`${formatPath(path)} must include both x and y when setting an anchor`);
      }
      if (hasX && hasY) {
        if (typeof territory.x !== "number" || Number.isNaN(territory.x) || territory.x < 0 || territory.x > 1) {
          errors.push(`${formatPath([...path, "x"])} must be a number between 0 and 1`);
        }
        if (typeof territory.y !== "number" || Number.isNaN(territory.y) || territory.y < 0 || territory.y > 1) {
          errors.push(`${formatPath([...path, "y"])} must be a number between 0 and 1`);
        }
        if (
          typeof territory.x === "number" &&
          territory.x >= 0 &&
          territory.x <= 1 &&
          typeof territory.y === "number" &&
          territory.y >= 0 &&
          territory.y <= 1
        ) {
          anchors[id] = { x: territory.x, y: territory.y };
        }
      }
    }
  }

  const adjacency: Record<string, string[]> = {};
  if (isRecord(adjacencyRaw)) {
    for (const territoryId of territoryIds) {
      adjacency[territoryId] = [];
      if (!(territoryId in adjacencyRaw)) {
        errors.push(`adjacency.${territoryId} is missing`);
      }
    }

    for (const [territoryId, neighborsRaw] of Object.entries(adjacencyRaw)) {
      if (!territoryIds.has(territoryId)) {
        errors.push(`adjacency.${territoryId} references unknown territory "${territoryId}"`);
        continue;
      }
      if (!Array.isArray(neighborsRaw)) {
        errors.push(`adjacency.${territoryId} must be an array of territory ids`);
        continue;
      }

      const seenNeighbors = new Set<string>();
      const neighbors: string[] = [];
      for (const [neighborIndex, neighborRaw] of neighborsRaw.entries()) {
        const path = ["adjacency", territoryId, String(neighborIndex)];
        const neighborId = ensureString(neighborRaw, path, errors);
        if (!neighborId) continue;
        if (!territoryIds.has(neighborId)) {
          errors.push(`${formatPath(path)} references unknown territory "${neighborId}"`);
          continue;
        }
        if (neighborId === territoryId) {
          errors.push(`${formatPath(path)} must not self-reference "${territoryId}"`);
          continue;
        }
        if (seenNeighbors.has(neighborId)) {
          errors.push(`${formatPath(path)} duplicates neighbor "${neighborId}"`);
          continue;
        }

        seenNeighbors.add(neighborId);
        neighbors.push(neighborId);
      }

      adjacency[territoryId] = neighbors;
    }

    for (const [from, neighbors] of Object.entries(adjacency)) {
      for (const to of neighbors) {
        if (!adjacency[to]?.includes(from)) {
          errors.push(`adjacency is asymmetric between "${from}" and "${to}"`);
        }
      }
    }
  }

  const continents: Record<string, EditorContinent> = {};
  const territoryAssignmentCounts = new Map<string, number>();
  for (const territoryId of territoryIds) {
    territoryAssignmentCounts.set(territoryId, 0);
  }

  if (Array.isArray(continentsRaw)) {
    const continentIds = new Set<string>();

    for (const [index, continent] of continentsRaw.entries()) {
      const path = ["continents", String(index)];
      if (!isRecord(continent)) {
        errors.push(`${formatPath(path)} must be an object`);
        continue;
      }

      const id = ensureString(continent.id, [...path, "id"], errors);
      if (!id) continue;
      if (continentIds.has(id)) {
        errors.push(`${formatPath([...path, "id"])} duplicates continent id "${id}"`);
        continue;
      }
      continentIds.add(id);

      const bonus = ensureInteger(continent.bonus, [...path, "bonus"], errors);
      if (bonus <= 0) {
        errors.push(`${formatPath([...path, "bonus"])} must be a positive integer`);
      }

      if (!Array.isArray(continent.territoryIds)) {
        errors.push(`${formatPath([...path, "territoryIds"])} must be an array`);
        continue;
      }

      const memberIds: string[] = [];
      const seenMemberIds = new Set<string>();
      for (const [memberIndex, memberRaw] of continent.territoryIds.entries()) {
        const memberPath = [...path, "territoryIds", String(memberIndex)];
        const territoryId = ensureString(memberRaw, memberPath, errors);
        if (!territoryId) continue;

        if (!territoryIds.has(territoryId)) {
          errors.push(`${formatPath(memberPath)} references unknown territory "${territoryId}"`);
          continue;
        }

        if (seenMemberIds.has(territoryId)) {
          errors.push(`${formatPath(memberPath)} duplicates territory "${territoryId}"`);
          continue;
        }

        seenMemberIds.add(territoryId);
        memberIds.push(territoryId);
        territoryAssignmentCounts.set(
          territoryId,
          (territoryAssignmentCounts.get(territoryId) ?? 0) + 1,
        );
      }

      if (memberIds.length === 0) {
        errors.push(`${formatPath([...path, "territoryIds"])} must include at least one territory`);
      }

      continents[id] = {
        bonus,
        territoryIds: memberIds,
      };
    }
  }

  for (const [territoryId, count] of territoryAssignmentCounts.entries()) {
    if (count === 0) {
      errors.push(`Territory "${territoryId}" is not assigned to any continent`);
    }
  }

  let playerLimits: { minPlayers: number; maxPlayers: number } | null = null;
  if (parsed.playerLimits !== undefined) {
    if (!isRecord(parsed.playerLimits)) {
      errors.push("playerLimits must be an object");
    } else {
      const minPlayers = ensureInteger(parsed.playerLimits.minPlayers, ["playerLimits", "minPlayers"], errors);
      const maxPlayers = ensureInteger(parsed.playerLimits.maxPlayers, ["playerLimits", "maxPlayers"], errors);
      if (minPlayers < 2) {
        errors.push("playerLimits.minPlayers must be >= 2");
      }
      if (maxPlayers < minPlayers) {
        errors.push("playerLimits.maxPlayers must be >= playerLimits.minPlayers");
      }
      playerLimits = { minPlayers, maxPlayers };
    }
  }

  if (Object.keys(anchors).length === 0) {
    warnings.push("No anchor suggestions provided. You can place markers manually in the editor.");
  }

  if (errors.length > 0) {
    return { value: null, errors };
  }

  return {
    value: {
      graphMap: {
        territories,
        adjacency,
        continents,
      },
      anchors,
      playerLimits,
      warnings,
    },
    errors: [],
  };
}

export function buildMapImportPrompt(): string {
  return `You are generating map seed JSON for a Global Domination-style game editor. Return ONLY valid JSON.

Schema:
{
  "territories": [
    {
      "id": "string (kebab-case)",
      "name": "string",
      "tags": ["string"],
      "x": "number 0..1 (optional; requires y)",
      "y": "number 0..1 (optional; requires x)"
    }
  ],
  "adjacency": {
    "territoryId": ["neighborTerritoryId"]
  },
  "continents": [
    {
      "id": "string",
      "bonus": "positive integer",
      "territoryIds": ["territoryId"]
    }
  ],
  "playerLimits": {
    "minPlayers": "integer >= 2",
    "maxPlayers": "integer >= minPlayers"
  }
}

Hard constraints:
1. Use valid JSON (double quotes, no trailing commas, no comments).
2. Every territory id must be unique.
3. adjacency must be symmetric: if A lists B, B must list A.
4. adjacency and continents must only reference known territory ids.
5. Every territory must be assigned to at least one continent.
6. Continent bonuses must be positive integers.
7. Anchor x/y values are draft suggestions only and must be normalized 0..1.

Quality checklist:
- Keep adjacency graph connected.
- Avoid over-dense adjacency; use plausible geographic neighbors.
- Keep continent sizes reasonably balanced for play.
- Include short readable territory names.

Example JSON:
{
  "territories": [
    { "id": "north-harbor", "name": "North Harbor", "x": 0.31, "y": 0.18 },
    { "id": "old-quarry", "name": "Old Quarry", "x": 0.52, "y": 0.29 },
    { "id": "sunfield", "name": "Sunfield", "x": 0.74, "y": 0.41 }
  ],
  "adjacency": {
    "north-harbor": ["old-quarry"],
    "old-quarry": ["north-harbor", "sunfield"],
    "sunfield": ["old-quarry"]
  },
  "continents": [
    {
      "id": "northland",
      "bonus": 2,
      "territoryIds": ["north-harbor", "old-quarry", "sunfield"]
    }
  ],
  "playerLimits": {
    "minPlayers": 2,
    "maxPlayers": 4
  }
}`;
}
