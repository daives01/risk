import { describe, expect, test } from "bun:test";
import { defaultRuleset, resolveInitialArmies } from "./config.js";
import type { RulesetConfig } from "./config.js";

describe("RulesetConfig", () => {
  test("defaultRuleset satisfies RulesetConfig", () => {
    const config: RulesetConfig = defaultRuleset;
    expect(config).toBeDefined();
  });

  test("defaultRuleset is JSON-serializable", () => {
    const json = JSON.stringify(defaultRuleset);
    const parsed = JSON.parse(json) as RulesetConfig;
    expect(parsed).toEqual(defaultRuleset);
  });

  test("setup has classic initial armies for 2-6 players", () => {
    for (let p = 2; p <= 6; p++) {
      expect(defaultRuleset.setup.playerInitialArmies[p]).toBeGreaterThan(0);
    }
  });

  test("resolveInitialArmies scales with territory count", () => {
    const setup = defaultRuleset.setup;
    const neutralArmies = setup.neutralTerritoryCount * setup.neutralInitialArmies;

    expect(resolveInitialArmies(setup, 4, 42, setup.neutralTerritoryCount)).toBe(
      Math.ceil((Math.round(42 * 2.8) - neutralArmies) / 4),
    );
    expect(resolveInitialArmies(setup, 4, 84, setup.neutralTerritoryCount)).toBeGreaterThan(
      resolveInitialArmies(setup, 4, 42, setup.neutralTerritoryCount),
    );
  });

  test("combat defaults to classic values", () => {
    expect(defaultRuleset.combat.maxAttackDice).toBe(3);
    expect(defaultRuleset.combat.maxDefendDice).toBe(2);
    expect(defaultRuleset.combat.defenderDiceStrategy).toBe("alwaysMax");
  });

  test("cards tradeValues starts at 4", () => {
    expect(defaultRuleset.cards.tradeValues[0]).toBe(4);
    expect(defaultRuleset.cards.tradeValues.length).toBeGreaterThan(0);
    expect(defaultRuleset.cards.tradeValueOverflow).toBe("continueByFive");
  });

  test("teams disabled by default", () => {
    expect(defaultRuleset.teams.teamsEnabled).toBe(false);
  });

  test("fortify mode is connected by default", () => {
    expect(defaultRuleset.fortify.fortifyMode).toBe("connected");
    expect(defaultRuleset.fortify.maxFortifiesPerTurn).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
});
