import { describe, expect, test } from "bun:test";
import { resolveAutoSelectState, sortCardsByKind } from "./game-card-utils";

describe("sortCardsByKind", () => {
  test("groups cards as A, B, C, then W while preserving matching-card order", () => {
    const cards = [
      { cardId: "c-1", kind: "C" },
      { cardId: "a-1", kind: "A" },
      { cardId: "w-1", kind: "W" },
      { cardId: "b-1", kind: "B" },
      { cardId: "a-2", kind: "A" },
    ];

    expect(sortCardsByKind(cards).map((card) => card.cardId)).toEqual([
      "a-1",
      "a-2",
      "b-1",
      "c-1",
      "w-1",
    ]);
    expect(cards[0]?.cardId).toBe("c-1");
  });
});

describe("resolveAutoSelectState", () => {
  test("hides without a valid set, selects an optimal set, then toggles it off", () => {
    expect(resolveAutoSelectState(new Set(["manual"]), null)).toEqual({
      visible: false,
      active: false,
      nextSelection: new Set(["manual"]),
    });

    const optimal = ["a", "b", "c"];
    expect(resolveAutoSelectState(new Set(["manual"]), optimal)).toEqual({
      visible: true,
      active: false,
      nextSelection: new Set(optimal),
    });
    expect(resolveAutoSelectState(new Set(optimal), optimal)).toEqual({
      visible: true,
      active: true,
      nextSelection: new Set(),
    });
  });
});
