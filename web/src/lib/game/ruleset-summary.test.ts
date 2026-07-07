import { describe, expect, test } from "bun:test";
import { formatCardIncrementLabel, resolveCardIncrementPresetKey } from "./ruleset-summary";

describe("ruleset summary", () => {
  test("recognizes the capped card increment preset", () => {
    const tradeValues = [4, 6, 8, 10, 12, 15, 20, 25, 30];

    expect(resolveCardIncrementPresetKey(tradeValues, "repeatLast")).toBe("capped");
    expect(formatCardIncrementLabel(tradeValues, "repeatLast")).toBe(
      "Capped (4,6,8,10,12,15, 20, 25, then 30)",
    );
  });

  test("formats custom schedules without falling back to a preset label", () => {
    expect(formatCardIncrementLabel([4, 6, 8, 10, 12, 20], "continueByFive")).toBe(
      "4, 6, 8, 10, 12, 20 then +5",
    );
  });
});
