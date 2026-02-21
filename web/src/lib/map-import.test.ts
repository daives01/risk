import { describe, expect, test } from "bun:test";
import { buildMapImportPrompt, parseMapImportJson } from "./map-import";

describe("parseMapImportJson", () => {
  test("parses a valid payload", () => {
    const input = JSON.stringify({
      territories: [
        { id: "alpha", name: "Alpha", x: 0.2, y: 0.3 },
        { id: "beta", name: "Beta", x: 0.7, y: 0.5 },
      ],
      adjacency: {
        alpha: ["beta"],
        beta: ["alpha"],
      },
      continents: [
        {
          id: "center",
          bonus: 2,
          territoryIds: ["alpha", "beta"],
        },
      ],
      playerLimits: {
        minPlayers: 2,
        maxPlayers: 5,
      },
    });

    const result = parseMapImportJson(input);

    expect(result.errors).toEqual([]);
    expect(result.value).not.toBeNull();
    expect(result.value?.graphMap.territories).toEqual({
      alpha: { name: "Alpha" },
      beta: { name: "Beta" },
    });
    expect(result.value?.graphMap.adjacency).toEqual({
      alpha: ["beta"],
      beta: ["alpha"],
    });
    expect(result.value?.graphMap.continents).toEqual({
      center: { bonus: 2, territoryIds: ["alpha", "beta"] },
    });
    expect(result.value?.anchors).toEqual({
      alpha: { x: 0.2, y: 0.3 },
      beta: { x: 0.7, y: 0.5 },
    });
    expect(result.value?.playerLimits).toEqual({ minPlayers: 2, maxPlayers: 5 });
  });

  test("returns actionable validation errors", () => {
    const input = JSON.stringify({
      territories: [
        { id: "alpha" },
        { id: "beta" },
      ],
      adjacency: {
        alpha: ["beta", "beta"],
        beta: [],
      },
      continents: [
        { id: "broken", bonus: 0, territoryIds: ["alpha", "missing"] },
      ],
      playerLimits: {
        minPlayers: 1,
        maxPlayers: 0,
      },
    });

    const result = parseMapImportJson(input);

    expect(result.value).toBeNull();
    expect(result.errors).toContain('adjacency.alpha.1 duplicates neighbor "beta"');
    expect(result.errors).toContain('adjacency is asymmetric between "alpha" and "beta"');
    expect(result.errors).toContain('continents.0.bonus must be a positive integer');
    expect(result.errors).toContain('continents.0.territoryIds.1 references unknown territory "missing"');
    expect(result.errors).toContain('Territory "beta" is not assigned to any continent');
    expect(result.errors).toContain("playerLimits.minPlayers must be >= 2");
    expect(result.errors).toContain(
      "playerLimits.maxPlayers must be >= playerLimits.minPlayers",
    );
  });

  test("allows a territory to belong to multiple continents", () => {
    const input = JSON.stringify({
      territories: [
        { id: "alpha" },
        { id: "beta" },
      ],
      adjacency: {
        alpha: ["beta"],
        beta: ["alpha"],
      },
      continents: [
        { id: "north", bonus: 2, territoryIds: ["alpha", "beta"] },
        { id: "ring", bonus: 1, territoryIds: ["alpha"] },
      ],
    });

    const result = parseMapImportJson(input);

    expect(result.errors).toEqual([]);
    expect(result.value).not.toBeNull();
    expect(result.value?.graphMap.continents).toEqual({
      north: { bonus: 2, territoryIds: ["alpha", "beta"] },
      ring: { bonus: 1, territoryIds: ["alpha"] },
    });
  });
});

describe("buildMapImportPrompt", () => {
  test("includes schema and constraints for LLM seeding", () => {
    const prompt = buildMapImportPrompt();

    expect(prompt).toContain('"territories"');
    expect(prompt).toContain('"adjacency"');
    expect(prompt).toContain("adjacency must be symmetric");
    expect(prompt).toContain("Every territory must be assigned to at least one continent");
    expect(prompt).toContain("Example JSON");
  });
});
