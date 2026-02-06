import { describe, expect, test } from "bun:test";
import { createDeck, drawCard } from "./cards.js";
import { createRng } from "./rng.js";
import type { CardId, TerritoryId } from "./types.js";
import type { DeckDefinitionConfig } from "./config.js";

// ── Helpers ────────────────────────────────────────────────────────────

const T1 = "t1" as TerritoryId;
const T2 = "t2" as TerritoryId;
const T3 = "t3" as TerritoryId;
const T4 = "t4" as TerritoryId;
const T5 = "t5" as TerritoryId;
const T6 = "t6" as TerritoryId;

const territories: TerritoryId[] = [T1, T2, T3, T4, T5, T6];

const defaultDeckConfig: DeckDefinitionConfig = {
  kinds: ["A", "B", "C"],
  wildCount: 2,
  territoryLinked: true,
};

// ── Tests ──────────────────────────────────────────────────────────────

describe("createDeck", () => {
  test("creates one card per territory plus wilds", () => {
    const rng = createRng({ seed: "test", index: 0 });
    const result = createDeck(defaultDeckConfig, territories, rng);

    const totalCards = territories.length + defaultDeckConfig.wildCount;
    expect(result.deck.draw.length).toBe(totalCards);
    expect(result.deck.discard.length).toBe(0);
    expect(Object.keys(result.cardsById).length).toBe(totalCards);
  });

  test("assigns kinds by cycling through config kinds", () => {
    const rng = createRng({ seed: "test", index: 0 });
    const result = createDeck(defaultDeckConfig, territories, rng);

    // Card 0 → A, 1 → B, 2 → C, 3 → A, 4 → B, 5 → C
    expect(result.cardsById["card_0"]!.kind).toBe("A");
    expect(result.cardsById["card_1"]!.kind).toBe("B");
    expect(result.cardsById["card_2"]!.kind).toBe("C");
    expect(result.cardsById["card_3"]!.kind).toBe("A");
    expect(result.cardsById["card_4"]!.kind).toBe("B");
    expect(result.cardsById["card_5"]!.kind).toBe("C");
  });

  test("wild cards have kind W", () => {
    const rng = createRng({ seed: "test", index: 0 });
    const result = createDeck(defaultDeckConfig, territories, rng);

    expect(result.cardsById["card_w0"]!.kind).toBe("W");
    expect(result.cardsById["card_w1"]!.kind).toBe("W");
  });

  test("territory-linked cards have territoryId", () => {
    const rng = createRng({ seed: "test", index: 0 });
    const result = createDeck(defaultDeckConfig, territories, rng);

    expect(result.cardsById["card_0"]!.territoryId).toBe(T1);
    expect(result.cardsById["card_1"]!.territoryId).toBe(T2);
    expect(result.cardsById["card_5"]!.territoryId).toBe(T6);
    // Wilds have no territoryId
    expect(result.cardsById["card_w0"]!.territoryId).toBeUndefined();
  });

  test("non-territory-linked cards have no territoryId", () => {
    const config: DeckDefinitionConfig = {
      kinds: ["A", "B", "C"],
      wildCount: 1,
      territoryLinked: false,
    };
    const rng = createRng({ seed: "test", index: 0 });
    const result = createDeck(config, territories, rng);

    for (const id of Object.keys(result.cardsById)) {
      expect(result.cardsById[id]!.territoryId).toBeUndefined();
    }
  });

  test("deck is shuffled deterministically", () => {
    const rng1 = createRng({ seed: "test", index: 0 });
    const rng2 = createRng({ seed: "test", index: 0 });
    const result1 = createDeck(defaultDeckConfig, territories, rng1);
    const result2 = createDeck(defaultDeckConfig, territories, rng2);

    expect(result1.deck.draw).toEqual(result2.deck.draw);
  });

  test("different seeds produce different shuffles", () => {
    const rng1 = createRng({ seed: "seed-a", index: 0 });
    const rng2 = createRng({ seed: "seed-b", index: 0 });
    const result1 = createDeck(defaultDeckConfig, territories, rng1);
    const result2 = createDeck(defaultDeckConfig, territories, rng2);

    // Extremely unlikely to be the same with different seeds
    expect(result1.deck.draw).not.toEqual(result2.deck.draw);
  });

  test("all card IDs in draw pile are unique", () => {
    const rng = createRng({ seed: "test", index: 0 });
    const result = createDeck(defaultDeckConfig, territories, rng);

    const uniqueIds = new Set(result.deck.draw);
    expect(uniqueIds.size).toBe(result.deck.draw.length);
  });

  test("all card IDs in draw pile exist in cardsById", () => {
    const rng = createRng({ seed: "test", index: 0 });
    const result = createDeck(defaultDeckConfig, territories, rng);

    for (const id of result.deck.draw) {
      expect(result.cardsById[id]).toBeDefined();
    }
  });
});

describe("drawCard", () => {
  test("draws first card from draw pile", () => {
    const draw = ["c1" as CardId, "c2" as CardId, "c3" as CardId];
    const deck = { draw, discard: [] };
    const rng = createRng({ seed: "test", index: 0 });

    const result = drawCard(deck, rng);
    expect(result).not.toBeNull();
    expect(result!.cardId).toBe("c1");
    expect(result!.deck.draw.length).toBe(2);
    expect(result!.deck.draw[0]).toBe("c2");
    expect(result!.deck.draw[1]).toBe("c3");
  });

  test("does not modify discard pile when drawing", () => {
    const discard = ["d1" as CardId];
    const deck = { draw: ["c1" as CardId], discard };
    const rng = createRng({ seed: "test", index: 0 });

    const result = drawCard(deck, rng);
    expect(result!.deck.discard).toEqual(discard);
  });

  test("reshuffles discard into draw when draw pile is empty", () => {
    const discard = ["d1" as CardId, "d2" as CardId, "d3" as CardId];
    const deck = { draw: [] as CardId[], discard };
    const rng = createRng({ seed: "test", index: 0 });

    const result = drawCard(deck, rng);
    expect(result).not.toBeNull();
    // One card drawn, rest in draw pile
    expect(result!.deck.draw.length).toBe(2);
    expect(result!.deck.discard.length).toBe(0);
    // The drawn card is one of the discard cards
    expect(discard).toContain(result!.cardId);
  });

  test("reshuffle is deterministic", () => {
    const discard = ["d1" as CardId, "d2" as CardId, "d3" as CardId, "d4" as CardId];
    const deck = { draw: [] as CardId[], discard };

    const rng1 = createRng({ seed: "reshuffle", index: 0 });
    const rng2 = createRng({ seed: "reshuffle", index: 0 });

    const result1 = drawCard(deck, rng1);
    const result2 = drawCard(deck, rng2);

    expect(result1!.cardId).toBe(result2!.cardId);
    expect(result1!.deck.draw).toEqual(result2!.deck.draw);
  });

  test("returns null when both draw and discard are empty", () => {
    const deck = { draw: [] as CardId[], discard: [] as CardId[] };
    const rng = createRng({ seed: "test", index: 0 });

    const result = drawCard(deck, rng);
    expect(result).toBeNull();
  });

  test("card count is conserved across draw", () => {
    const draw = ["c1" as CardId, "c2" as CardId, "c3" as CardId];
    const discard = ["d1" as CardId];
    const deck = { draw, discard };
    const rng = createRng({ seed: "test", index: 0 });

    const totalBefore = deck.draw.length + deck.discard.length;
    const result = drawCard(deck, rng)!;
    const totalAfter = result.deck.draw.length + result.deck.discard.length + 1; // +1 for drawn card

    expect(totalAfter).toBe(totalBefore);
  });

  test("card count is conserved across reshuffle draw", () => {
    const discard = ["d1" as CardId, "d2" as CardId, "d3" as CardId];
    const deck = { draw: [] as CardId[], discard };
    const rng = createRng({ seed: "test", index: 0 });

    const totalBefore = deck.draw.length + deck.discard.length;
    const result = drawCard(deck, rng)!;
    const totalAfter = result.deck.draw.length + result.deck.discard.length + 1;

    expect(totalAfter).toBe(totalBefore);
  });
});
