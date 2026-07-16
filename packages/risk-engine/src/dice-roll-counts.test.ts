import { describe, expect, test } from "bun:test";
import {
  addRollsToFaceCounts,
  combineDieFaceCounts,
  createEmptyDieFaceCounts,
  summarizeDieFaceCounts,
} from "./dice-roll-counts";

describe("dice roll counts", () => {
  test("accumulates a histogram and derives its statistics", () => {
    const counts = addRollsToFaceCounts(createEmptyDieFaceCounts(), [1, 3, 3, 6]);
    expect(counts).toEqual({ ones: 1, twos: 0, threes: 2, fours: 0, fives: 0, sixes: 1 });
    expect(summarizeDieFaceCounts(counts)).toEqual({ diceCount: 4, rollSum: 13, average: 3.25, deviationFromExpected: -0.25 });
  });

  test("combines role histograms", () => {
    const attack = addRollsToFaceCounts(createEmptyDieFaceCounts(), [6, 6]);
    const defense = addRollsToFaceCounts(createEmptyDieFaceCounts(), [1]);
    expect(combineDieFaceCounts(attack, defense)).toEqual({ ones: 1, twos: 0, threes: 0, fours: 0, fives: 0, sixes: 2 });
  });

  test("rejects malformed dice and reports empty averages as unavailable", () => {
    expect(summarizeDieFaceCounts(createEmptyDieFaceCounts()).average).toBeNull();
    expect(() => addRollsToFaceCounts(createEmptyDieFaceCounts(), [7])).toThrow("Invalid six-sided die roll: 7");
    expect(() => addRollsToFaceCounts(createEmptyDieFaceCounts(), [1.5])).toThrow("Invalid six-sided die roll: 1.5");
  });
});
