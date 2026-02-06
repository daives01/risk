import { describe, expect, test } from "bun:test";
import { applyAction, ActionError } from "./engine.js";
import type {
  CardId,
  CardsTraded,
  GameState,
  PlayerId,
  TerritoryId,
  TradeCards,
  PlaceReinforcements,
} from "./types.js";
import type { CardsConfig } from "./config.js";
import { defaultRuleset } from "./config.js";

// ── Helpers ────────────────────────────────────────────────────────────

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;
const T1 = "t1" as TerritoryId;
const T2 = "t2" as TerritoryId;
const T3 = "t3" as TerritoryId;

const C1 = "c1" as CardId;
const C2 = "c2" as CardId;
const C3 = "c3" as CardId;
const C4 = "c4" as CardId;
const C5 = "c5" as CardId;
const C6 = "c6" as CardId;

const cardsConfig: CardsConfig = defaultRuleset.cards;

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    players: { p1: { status: "alive" }, p2: { status: "alive" } },
    turnOrder: [P1, P2],
    territories: {
      [T1]: { ownerId: P1, armies: 3 },
      [T2]: { ownerId: P1, armies: 2 },
      [T3]: { ownerId: P2, armies: 4 },
    },
    turn: { currentPlayerId: P1, phase: "Reinforcement", round: 1 },
    reinforcements: { remaining: 5 },
    deck: { draw: [], discard: [] },
    cardsById: {
      [C1]: { kind: "A", territoryId: T1 },
      [C2]: { kind: "A", territoryId: T2 },
      [C3]: { kind: "A", territoryId: T3 },
      [C4]: { kind: "B", territoryId: T1 },
      [C5]: { kind: "C", territoryId: T2 },
      [C6]: { kind: "W" },
    },
    hands: {
      [P1]: [C1, C2, C3, C4, C5],
    },
    tradesCompleted: 0,
    capturedThisTurn: false,
    rng: { seed: "test", index: 0 },
    stateVersion: 0,
    rulesetVersion: 1,
    ...overrides,
  };
}

function trade(...cardIds: CardId[]): TradeCards {
  return { type: "TradeCards", cardIds };
}

function place(territoryId: TerritoryId, count: number): PlaceReinforcements {
  return { type: "PlaceReinforcements", territoryId, count };
}

// ── TradeCards tests ─────────────────────────────────────────────────

describe("TradeCards", () => {
  test("accepts three-of-a-kind (AAA)", () => {
    const state = makeState();
    const result = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    expect(result.events).toHaveLength(1);
    const event = result.events[0] as CardsTraded;
    expect(event.type).toBe("CardsTraded");
    expect(event.playerId).toBe(P1);
    expect(event.cardIds).toEqual([C1, C2, C3]);
    expect(event.value).toBe(4 + 2); // tradeValues[0]=4, territory bonus=2 (C1 has T1 owned by P1)
    expect(event.tradesCompletedAfter).toBe(1);
  });

  test("accepts one-of-each (ABC)", () => {
    const state = makeState();
    const result = applyAction(
      state, P1, trade(C1, C4, C5),
      undefined, undefined, undefined, cardsConfig,
    );
    const event = result.events[0] as CardsTraded;
    expect(event.type).toBe("CardsTraded");
    // C1=A, C4=B, C5=C — one of each
    expect(event.value).toBe(4 + 2); // tradeValues[0]=4 + territory bonus (C1 → T1 owned by P1)
  });

  test("accepts wild substituting in three-of-a-kind", () => {
    const state = makeState({
      hands: { [P1]: [C1, C2, C6] }, // A, A, W
    });
    const result = applyAction(
      state, P1, trade(C1, C2, C6),
      undefined, undefined, undefined, cardsConfig,
    );
    const event = result.events[0] as CardsTraded;
    expect(event.type).toBe("CardsTraded");
  });

  test("accepts wild substituting in one-of-each", () => {
    const state = makeState({
      hands: { [P1]: [C1, C4, C6] }, // A, B, W
    });
    const result = applyAction(
      state, P1, trade(C1, C4, C6),
      undefined, undefined, undefined, cardsConfig,
    );
    const event = result.events[0] as CardsTraded;
    expect(event.type).toBe("CardsTraded");
  });

  test("rejects invalid set (AAB without wild)", () => {
    const state = makeState({
      hands: { [P1]: [C1, C2, C4] }, // A, A, B
    });
    expect(() =>
      applyAction(state, P1, trade(C1, C2, C4), undefined, undefined, undefined, cardsConfig),
    ).toThrow(ActionError);
  });

  test("rejects wrong phase", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
      reinforcements: undefined,
    });
    expect(() =>
      applyAction(state, P1, trade(C1, C2, C3), undefined, undefined, undefined, cardsConfig),
    ).toThrow("expected Reinforcement");
  });

  test("rejects wrong player", () => {
    const state = makeState();
    expect(() =>
      applyAction(state, P2, trade(C1, C2, C3), undefined, undefined, undefined, cardsConfig),
    ).toThrow("Not your turn");
  });

  test("rejects fewer than 3 cards", () => {
    const state = makeState();
    expect(() =>
      applyAction(state, P1, trade(C1, C2), undefined, undefined, undefined, cardsConfig),
    ).toThrow("exactly 3 cards");
  });

  test("rejects more than 3 cards", () => {
    const state = makeState();
    expect(() =>
      applyAction(state, P1, trade(C1, C2, C3, C4), undefined, undefined, undefined, cardsConfig),
    ).toThrow("exactly 3 cards");
  });

  test("rejects cards not in hand", () => {
    const state = makeState({
      hands: { [P1]: [C1, C2] }, // missing C3
    });
    expect(() =>
      applyAction(state, P1, trade(C1, C2, C3), undefined, undefined, undefined, cardsConfig),
    ).toThrow("not in your hand");
  });

  test("rejects duplicate card IDs", () => {
    const state = makeState();
    expect(() =>
      applyAction(state, P1, trade(C1, C1, C2), undefined, undefined, undefined, cardsConfig),
    ).toThrow("Duplicate");
  });

  test("requires CardsConfig", () => {
    const state = makeState();
    expect(() =>
      applyAction(state, P1, trade(C1, C2, C3)),
    ).toThrow("CardsConfig is required");
  });

  test("removes traded cards from hand", () => {
    const state = makeState();
    const result = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    const hand = result.state.hands[P1]!;
    expect(hand).not.toContain(C1);
    expect(hand).not.toContain(C2);
    expect(hand).not.toContain(C3);
    expect(hand).toContain(C4);
    expect(hand).toContain(C5);
  });

  test("adds traded cards to discard pile", () => {
    const state = makeState();
    const result = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    expect(result.state.deck.discard).toEqual([C1, C2, C3]);
  });

  test("increments tradesCompleted", () => {
    const state = makeState();
    const result = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    expect(result.state.tradesCompleted).toBe(1);
  });

  test("adds trade value to reinforcements remaining", () => {
    const state = makeState({ reinforcements: { remaining: 5 } });
    const result = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    // tradeValues[0]=4 + territory bonus=2 = 6
    expect(result.state.reinforcements!.remaining).toBe(5 + 6);
  });

  test("increments stateVersion", () => {
    const state = makeState({ stateVersion: 7 });
    const result = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    expect(result.state.stateVersion).toBe(8);
  });
});

describe("TradeCards - trade values schedule", () => {
  test("first trade gives tradeValues[0]", () => {
    const state = makeState({ tradesCompleted: 0 });
    const result = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    const event = result.events[0] as CardsTraded;
    // value = tradeValues[0] (4) + territory bonus (2) = 6
    expect(event.value).toBe(6);
  });

  test("second trade gives tradeValues[1]", () => {
    const state = makeState({ tradesCompleted: 1 });
    const result = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    const event = result.events[0] as CardsTraded;
    // tradeValues[1] = 6 + territory bonus 2 = 8
    expect(event.value).toBe(8);
  });

  test("overflow repeats last value", () => {
    // tradeValues = [4, 6, 8, 10, 12, 15], so index 6+ should give 15
    const state = makeState({ tradesCompleted: 10 });
    const result = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    const event = result.events[0] as CardsTraded;
    // tradeValues[last]=15 + territory bonus 2 = 17
    expect(event.value).toBe(17);
  });
});

describe("TradeCards - territory bonus", () => {
  test("grants bonus when traded card matches owned territory", () => {
    // C1 has territoryId=T1, which is owned by P1
    const state = makeState();
    const result = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    const event = result.events[0] as CardsTraded;
    expect(event.value).toBe(4 + 2); // base + bonus
  });

  test("no bonus when no traded card matches owned territory", () => {
    // All cards linked to T3 which P2 owns
    const state = makeState({
      cardsById: {
        [C1]: { kind: "A", territoryId: T3 },
        [C2]: { kind: "A", territoryId: T3 },
        [C3]: { kind: "A", territoryId: T3 },
      },
      hands: { [P1]: [C1, C2, C3] },
    });
    const result = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    const event = result.events[0] as CardsTraded;
    expect(event.value).toBe(4); // base only, no bonus
  });

  test("no bonus when territory bonus disabled", () => {
    const config: CardsConfig = {
      ...cardsConfig,
      territoryTradeBonus: { enabled: false, bonusArmies: 2 },
    };
    const state = makeState();
    const result = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, config,
    );
    const event = result.events[0] as CardsTraded;
    expect(event.value).toBe(4); // base only
  });

  test("bonus applied only once per trade even with multiple matching cards", () => {
    // C1 → T1 (owned by P1), C2 → T2 (owned by P1), both match
    const state = makeState();
    const result = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    const event = result.events[0] as CardsTraded;
    expect(event.value).toBe(4 + 2); // only one bonus, not 2*2
  });
});

describe("TradeCards - wild handling", () => {
  test("wild does not substitute when wildActsAsAny is false", () => {
    const config: CardsConfig = {
      ...cardsConfig,
      tradeSets: { ...cardsConfig.tradeSets, wildActsAsAny: false },
    };
    const state = makeState({
      hands: { [P1]: [C1, C2, C6] }, // A, A, W
    });
    expect(() =>
      applyAction(state, P1, trade(C1, C2, C6), undefined, undefined, undefined, config),
    ).toThrow("Invalid trade set");
  });

  test("three wilds is valid three-of-a-kind", () => {
    const CW1 = "cw1" as CardId;
    const CW2 = "cw2" as CardId;
    const CW3 = "cw3" as CardId;
    const state = makeState({
      cardsById: {
        [CW1]: { kind: "W" },
        [CW2]: { kind: "W" },
        [CW3]: { kind: "W" },
      },
      hands: { [P1]: [CW1, CW2, CW3] },
    });
    const result = applyAction(
      state, P1, trade(CW1, CW2, CW3),
      undefined, undefined, undefined, cardsConfig,
    );
    expect(result.events[0]!.type).toBe("CardsTraded");
  });
});

describe("TradeCards - set rules config", () => {
  test("rejects three-of-a-kind when disabled", () => {
    const config: CardsConfig = {
      ...cardsConfig,
      tradeSets: { ...cardsConfig.tradeSets, allowThreeOfAKind: false },
    };
    const state = makeState();
    expect(() =>
      applyAction(state, P1, trade(C1, C2, C3), undefined, undefined, undefined, config),
    ).toThrow("Invalid trade set");
  });

  test("rejects one-of-each when disabled", () => {
    const config: CardsConfig = {
      ...cardsConfig,
      tradeSets: { ...cardsConfig.tradeSets, allowOneOfEach: false },
    };
    const state = makeState({
      hands: { [P1]: [C1, C4, C5] }, // A, B, C
    });
    expect(() =>
      applyAction(state, P1, trade(C1, C4, C5), undefined, undefined, undefined, config),
    ).toThrow("Invalid trade set");
  });
});

describe("Forced trade enforcement", () => {
  test("rejects PlaceReinforcements when hand >= forcedTradeHandSize", () => {
    const state = makeState({
      hands: { [P1]: [C1, C2, C3, C4, C5] }, // 5 cards, threshold is 5
    });
    expect(() =>
      applyAction(state, P1, place(T1, 1), undefined, undefined, undefined, cardsConfig),
    ).toThrow("Must trade cards before placing reinforcements");
  });

  test("allows PlaceReinforcements when hand < forcedTradeHandSize", () => {
    const state = makeState({
      hands: { [P1]: [C1, C2, C3, C4] }, // 4 cards, threshold is 5
    });
    const result = applyAction(
      state, P1, place(T1, 1), undefined, undefined, undefined, cardsConfig,
    );
    expect(result.state.territories[T1]!.armies).toBe(4);
  });

  test("allows PlaceReinforcements after trading down below threshold", () => {
    const state = makeState({
      hands: { [P1]: [C1, C2, C3, C4, C5] }, // 5 cards
    });
    // First trade to get below threshold
    const afterTrade = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    // Now hand has [C4, C5] = 2 cards, below threshold
    expect(afterTrade.state.hands[P1]!.length).toBe(2);
    // Should now be able to place
    const afterPlace = applyAction(
      afterTrade.state, P1, place(T1, 1),
      undefined, undefined, undefined, cardsConfig,
    );
    expect(afterPlace.state.territories[T1]!.armies).toBe(4);
  });

  test("no forced trade check when cardsConfig not provided", () => {
    const state = makeState({
      hands: { [P1]: [C1, C2, C3, C4, C5] }, // 5 cards, but no cardsConfig
    });
    // Without cardsConfig, forced trade is not enforced
    const result = applyAction(state, P1, place(T1, 1));
    expect(result.state.territories[T1]!.armies).toBe(4);
  });
});

describe("TradeCards - multiple trades in one turn", () => {
  test("can trade multiple times, values escalate", () => {
    const CX1 = "cx1" as CardId;
    const CX2 = "cx2" as CardId;
    const CX3 = "cx3" as CardId;
    const state = makeState({
      cardsById: {
        [C1]: { kind: "A" },
        [C2]: { kind: "A" },
        [C3]: { kind: "A" },
        [CX1]: { kind: "B" },
        [CX2]: { kind: "B" },
        [CX3]: { kind: "B" },
      },
      hands: { [P1]: [C1, C2, C3, CX1, CX2, CX3] },
    });

    // First trade
    const r1 = applyAction(
      state, P1, trade(C1, C2, C3),
      undefined, undefined, undefined, cardsConfig,
    );
    const e1 = r1.events[0] as CardsTraded;
    expect(e1.value).toBe(4); // tradeValues[0], no territory bonus
    expect(e1.tradesCompletedAfter).toBe(1);

    // Second trade
    const r2 = applyAction(
      r1.state, P1, trade(CX1, CX2, CX3),
      undefined, undefined, undefined, cardsConfig,
    );
    const e2 = r2.events[0] as CardsTraded;
    expect(e2.value).toBe(6); // tradeValues[1], no territory bonus
    expect(e2.tradesCompletedAfter).toBe(2);
  });
});
