import { describe, expect, test } from "bun:test";
import { defaultRuleset } from "risk-engine";
import { resolveEffectiveRuleset, resolveRulesetFromOverrides, validateRulesetOverrides } from "./rulesets";

describe("rulesets", () => {
  test("resolves selected override fields on top of defaults", () => {
    const ruleset = resolveRulesetFromOverrides(false, {
      combat: { allowAttackerDiceChoice: false },
      cards: { forcedTradeHandSize: 6, awardCardOnCapture: false },
      fortify: { fortifyMode: "adjacent", maxFortifiesPerTurn: 2 },
    });

    expect(ruleset.combat.allowAttackerDiceChoice).toBe(false);
    expect(ruleset.cards.forcedTradeHandSize).toBe(6);
    expect(ruleset.cards.awardCardOnCapture).toBe(false);
    expect(ruleset.fortify.fortifyMode).toBe("adjacent");
    expect(ruleset.fortify.maxFortifiesPerTurn).toBe(2);
    expect(ruleset.setup).toEqual(defaultRuleset.setup);
  });

  test("team mode on defaults to cooperative team permissions", () => {
    const ruleset = resolveRulesetFromOverrides(true, undefined);
    expect(ruleset.teams.teamsEnabled).toBe(true);
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
  });

  test("uses persisted effective ruleset snapshot when present", () => {
    const snapshot = resolveRulesetFromOverrides(true, {
      combat: { allowAttackerDiceChoice: false },
      fortify: { maxFortifiesPerTurn: 1 },
    });
    const resolved = resolveEffectiveRuleset({
      teamModeEnabled: false,
      rulesetOverrides: { combat: { allowAttackerDiceChoice: true } },
      effectiveRuleset: snapshot,
    });

    expect(resolved.combat.allowAttackerDiceChoice).toBe(false);
    expect(resolved.fortify.maxFortifiesPerTurn).toBe(1);
    expect(resolved.teams.teamsEnabled).toBe(true);
  });
});
