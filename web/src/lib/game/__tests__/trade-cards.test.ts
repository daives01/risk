/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { findAutoTradeSet, isValidTradeSet, type TradeSetsConfig } from "../trade-cards";

const defaultTradeSets: TradeSetsConfig = {
  allowThreeOfAKind: true,
  allowOneOfEach: true,
  wildActsAsAny: true,
};

describe("trade cards", () => {
  test("accepts three-of-a-kind and one-of-each when enabled", () => {
    expect(isValidTradeSet(["I", "I", "I"], defaultTradeSets)).toBe(true);
    expect(isValidTradeSet(["I", "C", "A"], defaultTradeSets)).toBe(true);
  });

  test("rejects wilds when wild cards are disabled", () => {
    expect(
      isValidTradeSet(["I", "W", "I"], {
        ...defaultTradeSets,
        wildActsAsAny: false,
      }),
    ).toBe(false);
  });

  test("findAutoTradeSet prefers combinations with fewer wild cards", () => {
    const hand = [
      { cardId: "a", kind: "I" },
      { cardId: "b", kind: "I" },
      { cardId: "c", kind: "W" },
      { cardId: "d", kind: "I" },
    ];
    expect(findAutoTradeSet(hand, defaultTradeSets)).toEqual(["a", "b", "d"]);
  });

  test("findAutoTradeSet returns null for hands without valid trades", () => {
    const hand = [
      { cardId: "a", kind: "I" },
      { cardId: "b", kind: "I" },
      { cardId: "c", kind: "C" },
    ];
    const tradeSets: TradeSetsConfig = {
      allowThreeOfAKind: false,
      allowOneOfEach: false,
      wildActsAsAny: true,
    };
    expect(findAutoTradeSet(hand, tradeSets)).toBeNull();
  });
});
