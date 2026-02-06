import { describe, expect, test } from "bun:test";
import { validateMap } from "risk-engine";
import { classicMap } from "./classic.js";

describe("classicMap", () => {
  test("passes validateMap", () => {
    const result = validateMap(classicMap);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("has 42 territories", () => {
    expect(Object.keys(classicMap.territories)).toHaveLength(42);
  });

  test("has 6 continents", () => {
    expect(Object.keys(classicMap.continents!)).toHaveLength(6);
  });

  test("every territory belongs to a continent", () => {
    const allContinentTerritories = new Set(
      Object.values(classicMap.continents!).flatMap((c) => [...c.territoryIds]),
    );
    for (const tid of Object.keys(classicMap.territories)) {
      expect(allContinentTerritories.has(tid)).toBe(true);
    }
  });

  test("continent territory counts match standard Risk", () => {
    const counts: Record<string, number> = {};
    for (const [id, info] of Object.entries(classicMap.continents!)) {
      counts[id] = info.territoryIds.length;
    }
    expect(counts["north-america"]).toBe(9);
    expect(counts["south-america"]).toBe(4);
    expect(counts["europe"]).toBe(7);
    expect(counts["africa"]).toBe(6);
    expect(counts["asia"]).toBe(12);
    expect(counts["australia"]).toBe(4);
  });

  test("continent bonuses match standard Risk", () => {
    expect(classicMap.continents!["north-america"].bonus).toBe(5);
    expect(classicMap.continents!["south-america"].bonus).toBe(2);
    expect(classicMap.continents!["europe"].bonus).toBe(5);
    expect(classicMap.continents!["africa"].bonus).toBe(3);
    expect(classicMap.continents!["asia"].bonus).toBe(7);
    expect(classicMap.continents!["australia"].bonus).toBe(2);
  });
});
