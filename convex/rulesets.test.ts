import { describe, expect, test } from "bun:test";
import { defaultRuleset } from "risk-engine";
import {
  resolveEffectiveRuleset,
  resolveRulesetFromOverrides,
  sanitizeRulesetOverrides,
  validateRulesetOverrides,
} from "./rulesets";

describe("rulesets", () => {
  test("resolves selected override fields on top of defaults", () => {
    const ruleset = resolveRulesetFromOverrides(false, {
      combat: { allowAttackerDiceChoice: false },
      cards: { forcedTradeHandSize: 6, awardCardOnCapture: false, tradeValues: [4, 7, 10] },
      fortify: { fortifyMode: "adjacent", maxFortifiesPerTurn: 2 },
    });

    expect(ruleset.combat.allowAttackerDiceChoice).toBe(true);
    expect(ruleset.cards.forcedTradeHandSize).toBe(6);
    expect(ruleset.cards.tradeValues).toEqual([4, 7, 10]);
    expect(ruleset.cards.awardCardOnCapture).toBe(true);
    expect(ruleset.fortify.fortifyMode).toBe("adjacent");
    expect(ruleset.fortify.maxFortifiesPerTurn).toBe(2);
    expect(ruleset.setup).toEqual(defaultRuleset.setup);
  });

  test("team mode on defaults to cooperative team permissions", () => {
    const ruleset = resolveRulesetFromOverrides(true, undefined);
    expect(ruleset.teams.teamsEnabled).toBe(true);
    expect(ruleset.teams.preventAttackingTeammates).toBe(false);
    expect(ruleset.teams.allowPlaceOnTeammate).toBe(true);
    expect(ruleset.teams.allowFortifyWithTeammate).toBe(true);
    expect(ruleset.teams.allowFortifyThroughTeammates).toBe(true);
  });

  test("throws for invalid override bounds", () => {
    expect(() =>
      validateRulesetOverrides({ cards: { forcedTradeHandSize: 2 } }),
    ).toThrow(/forcedTradeHandSize/);
    expect(() =>
      validateRulesetOverrides({ fortify: { maxFortifiesPerTurn: 11 } }),
    ).toThrow(/maxFortifiesPerTurn/);
    expect(() =>
      validateRulesetOverrides({ cards: { tradeValues: [] } }),
    ).toThrow(/tradeValues/);
    expect(() =>
      validateRulesetOverrides({ cards: { tradeValues: [4, -1] } }),
    ).toThrow(/tradeValues/);
    expect(() =>
      validateRulesetOverrides({ cards: { tradeValueOverflow: "bad" as "repeatLast" } }),
    ).toThrow(/tradeValueOverflow/);
  });

  test("uses persisted effective ruleset snapshot when present", () => {
    const snapshot = resolveRulesetFromOverrides(true, {
      fortify: { maxFortifiesPerTurn: 1 },
    });
    const resolved = resolveEffectiveRuleset({
      teamModeEnabled: false,
      rulesetOverrides: { combat: { allowAttackerDiceChoice: false } },
      effectiveRuleset: snapshot,
    });

    expect(resolved.combat.allowAttackerDiceChoice).toBe(true);
    expect(resolved.fortify.maxFortifiesPerTurn).toBe(1);
    expect(resolved.teams.teamsEnabled).toBe(true);
  });

  test("sanitizes deprecated host toggles", () => {
    const sanitized = sanitizeRulesetOverrides({
      combat: { allowAttackerDiceChoice: false },
      cards: { awardCardOnCapture: false, forcedTradeHandSize: 6 },
      teams: { preventAttackingTeammates: true, allowPlaceOnTeammate: true },
    });
    expect(sanitized?.combat?.allowAttackerDiceChoice).toBeUndefined();
    expect(sanitized?.cards?.awardCardOnCapture).toBeUndefined();
    expect(sanitized?.teams?.preventAttackingTeammates).toBeUndefined();
    expect(sanitized?.cards?.forcedTradeHandSize).toBe(6);
    expect(sanitized?.teams?.allowPlaceOnTeammate).toBe(true);
  });
});
