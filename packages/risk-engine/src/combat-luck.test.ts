import { describe, expect, test } from "bun:test";
import { addCombatOutcome, combatLuckScore, createEmptyCombatLuckStats, expectedCombatOutcome } from "./combat-luck";

describe("combat luck", () => {
  test("calculates exact standard Risk expectations", () => {
    expect(expectedCombatOutcome(3, 2)).toEqual({ attackerLosses: 7161 / 7776, defenderLosses: 8391 / 7776 });
    expect(expectedCombatOutcome(1, 1)).toEqual({ attackerLosses: 21 / 36, defenderLosses: 15 / 36 });
  });

  test("scores mirrored attacker and defender outcomes", () => {
    const expected = expectedCombatOutcome(3, 2);
    const attacker = addCombatOutcome(createEmptyCombatLuckStats(), "attack", expected, 2, 0);
    const defender = addCombatOutcome(createEmptyCombatLuckStats(), "defense", expected, 2, 0);
    expect(combatLuckScore(attacker)).toBeCloseTo(-2.15818, 4);
    expect(combatLuckScore(defender)).toBeCloseTo(2.15818, 4);
  });
});
