import { describe, expect, test } from "bun:test";
import { validateMap, validateVisual, validateAuthoredMap } from "./map.js";
import type { GraphMap, MapVisual } from "./map.js";
import type { TerritoryId, ContinentId } from "./types.js";

const t = (id: string) => id as TerritoryId;
const c = (id: string) => id as ContinentId;

function makeValidMap(): GraphMap {
  return {
    territories: {
      A: { name: "Alaska" },
      B: { name: "Brazil" },
      C: { name: "Congo" },
    },
    adjacency: {
      A: [t("B")],
      B: [t("A"), t("C")],
      C: [t("B")],
    },
  };
}

function makeValidVisual(): MapVisual {
  return {
    imageStorageId: "test-storage-id",
    imageWidth: 1000,
    imageHeight: 600,
    territoryAnchors: {
      A: { x: 0.1, y: 0.2 },
      B: { x: 0.5, y: 0.4 },
      C: { x: 0.8, y: 0.9 },
    },
  };
}

describe("validateMap", () => {
  test("accepts a valid map without continents", () => {
    const result = validateMap(makeValidMap());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("accepts a valid map with continents", () => {
    const map: GraphMap = {
      ...makeValidMap(),
      continents: {
        NA: { territoryIds: [t("A")], bonus: 5 },
        SA: { territoryIds: [t("B"), t("C")], bonus: 3 },
      },
    };
    const result = validateMap(map);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects adjacency referencing unknown territory as key", () => {
    const map: GraphMap = {
      territories: { A: {} },
      adjacency: {
        A: [],
        Z: [t("A")],
      },
    };
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"Z"'))).toBe(true);
  });

  test("rejects adjacency target that does not exist", () => {
    const map: GraphMap = {
      territories: { A: {} },
      adjacency: {
        A: [t("X")],
      },
    };
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"X"'))).toBe(true);
  });

  test("rejects asymmetric adjacency", () => {
    const map: GraphMap = {
      territories: { A: {}, B: {} },
      adjacency: {
        A: [t("B")],
        B: [], // missing A
      },
    };
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not symmetric"))).toBe(true);
  });

  test("rejects territory with no adjacency entry", () => {
    const map: GraphMap = {
      territories: { A: {}, B: {} },
      adjacency: {
        A: [],
        // B missing
      },
    };
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"B"') && e.includes("no adjacency"))).toBe(true);
  });

  test("rejects continent referencing unknown territory", () => {
    const map: GraphMap = {
      territories: { A: {} },
      adjacency: { A: [] },
      continents: {
        X: { territoryIds: [t("A"), t("NOPE")], bonus: 2 },
      },
    };
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"NOPE"'))).toBe(true);
  });

  test("collects multiple errors at once", () => {
    const map: GraphMap = {
      territories: { A: {} },
      adjacency: {
        A: [t("B")], // B doesn't exist
        C: [t("A")], // C not in territories
      },
      continents: {
        X: { territoryIds: [t("Z")], bonus: 1 }, // Z doesn't exist
      },
    };
    const result = validateMap(map);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  test("accepts a single isolated territory", () => {
    const map: GraphMap = {
      territories: { A: {} },
      adjacency: { A: [] },
    };
    const result = validateMap(map);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("validateVisual", () => {
  test("accepts valid visual metadata", () => {
    const result = validateVisual(makeValidMap(), makeValidVisual());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("rejects missing anchor", () => {
    const visual = makeValidVisual();
    delete (visual.territoryAnchors as Record<string, { x: number; y: number }>).B;
    const result = validateVisual(makeValidMap(), visual);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Missing anchor for territory "B"'))).toBe(
      true,
    );
  });

  test("rejects out-of-range anchor coordinates", () => {
    const visual = makeValidVisual();
    (visual.territoryAnchors as Record<string, { x: number; y: number }>).A = {
      x: 1.2,
      y: -0.1,
    };
    const result = validateVisual(makeValidMap(), visual);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Anchor x for territory "A"'))).toBe(true);
    expect(result.errors.some((e) => e.includes('Anchor y for territory "A"'))).toBe(true);
  });
});

describe("validateAuthoredMap", () => {
  test("returns combined graph + visual errors", () => {
    const map: GraphMap = {
      territories: { A: {} },
      adjacency: { A: [t("Z")] },
    };
    const visual: MapVisual = {
      imageStorageId: "",
      imageWidth: 0,
      imageHeight: 0,
      territoryAnchors: {},
    };

    const result = validateAuthoredMap({ graphMap: map, visual });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});
