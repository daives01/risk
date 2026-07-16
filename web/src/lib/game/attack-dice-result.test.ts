import { describe, expect, test } from "bun:test";
import { buildAttackDiceResult } from "./attack-dice-result";

describe("buildAttackDiceResult", () => {
  test("builds the visible dice result directly from a live attack mutation", () => {
    expect(buildAttackDiceResult([
      {
        type: "AttackResolved",
        from: "alaska",
        to: "kamchatka",
        attackRolls: [6, 4, 1],
        defendRolls: [5, 4],
        attackerLosses: 1,
        defenderLosses: 1,
      },
    ], {
      alaska: { name: "Alaska" },
      kamchatka: { name: "Kamchatka" },
    }, "version-12", { attacker: "#ef4444", defender: "#38bdf8" })).toEqual({
      key: "version-12",
      fromId: "alaska",
      toId: "kamchatka",
      fromLabel: "Alaska",
      toLabel: "Kamchatka",
      attackRolls: [6, 4, 1],
      defendRolls: [5, 4],
      attackerLosses: 1,
      defenderLosses: 1,
      attackerColor: "#ef4444",
      defenderColor: "#38bdf8",
    });
  });
});
