import { describe, expect, test } from "bun:test";
import { defaultRuleset } from "./config.js";
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

  test("combat defaults to classic values", () => {
    expect(defaultRuleset.combat.maxAttackDice).toBe(3);
    expect(defaultRuleset.combat.maxDefendDice).toBe(2);
    expect(defaultRuleset.combat.defenderDiceStrategy).toBe("alwaysMax");
  });

  test("cards tradeValues starts at 4", () => {
    expect(defaultRuleset.cards.tradeValues[0]).toBe(4);
    expect(defaultRuleset.cards.tradeValues.length).toBeGreaterThan(0);
  });

  test("teams disabled by default", () => {
    expect(defaultRuleset.teams.teamsEnabled).toBe(false);
  });

  test("fortify mode is connected by default", () => {
    expect(defaultRuleset.fortify.fortifyMode).toBe("connected");
  });
});
