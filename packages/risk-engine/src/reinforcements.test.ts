import { describe, expect, test } from "bun:test";
import { calculateReinforcements } from "./reinforcements.js";
import type { GameState, PlayerId, TerritoryId, ContinentId } from "./types.js";
import type { GraphMap } from "./map.js";

// ── Helpers ────────────────────────────────────────────────────────────

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;

function tid(id: string): TerritoryId {
  return id as TerritoryId;
}

function cid(id: string): ContinentId {
  return id as ContinentId;
}

/** Build a minimal GameState with the given territory ownership. */
function makeState(
  ownership: Record<string, PlayerId | "neutral">,
): GameState {
  const territories: Record<string, { ownerId: PlayerId | "neutral"; armies: number }> = {};
  for (const [id, owner] of Object.entries(ownership)) {
    territories[id] = { ownerId: owner, armies: 1 };
  }
  return {
    players: { p1: { status: "alive" }, p2: { status: "alive" } },
    turnOrder: [P1, P2],
    territories,
    turn: { currentPlayerId: P1, phase: "Reinforcement", round: 1 },
    deck: { draw: [], discard: [] },
    cardsById: {},
    hands: {},
    tradesCompleted: 0,
    capturedThisTurn: false,
    rng: { seed: "test", index: 0 },
    stateVersion: 0,
    rulesetVersion: 1,
  };
}

/** Build a simple map with optional continents. */
function makeMap(
  territoryIds: string[],
  continents?: Record<string, { territoryIds: string[]; bonus: number }>,
): GraphMap {
  const territories: Record<string, {}> = {};
  const adjacency: Record<string, TerritoryId[]> = {};
  for (const id of territoryIds) {
    territories[id] = {};
    adjacency[id] = [];
  }
  const mapContinents: Record<string, { territoryIds: readonly TerritoryId[]; bonus: number }> | undefined =
    continents
      ? Object.fromEntries(
          Object.entries(continents).map(([cid, c]) => [
            cid,
            { territoryIds: c.territoryIds.map(tid), bonus: c.bonus },
          ]),
        )
      : undefined;
  return { territories, adjacency, continents: mapContinents };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("calculateReinforcements", () => {
  test("minimum 3 reinforcements even with few territories", () => {
    // 1 territory → floor(1/3)=0 → clamp to 3
    const state = makeState({ t1: P1, t2: P2 });
    const map = makeMap(["t1", "t2"]);
    const result = calculateReinforcements(state, P1, map);
    expect(result.total).toBe(3);
    expect(result.sources.territory).toBe(3);
  });

  test("minimum 3 with zero territories", () => {
    const state = makeState({ t1: P2 });
    const map = makeMap(["t1"]);
    const result = calculateReinforcements(state, P1, map);
    expect(result.total).toBe(3);
    expect(result.sources.territory).toBe(3);
  });

  test("minimum 3 at exactly 9 territories (floor(9/3)=3)", () => {
    const ownership: Record<string, PlayerId | "neutral"> = {};
    for (let i = 0; i < 9; i++) ownership[`t${i}`] = P1;
    const state = makeState(ownership);
    const map = makeMap(Object.keys(ownership));
    const result = calculateReinforcements(state, P1, map);
    expect(result.total).toBe(3);
    expect(result.sources.territory).toBe(3);
  });

  test("10 territories gives 3 (floor(10/3)=3)", () => {
    const ownership: Record<string, PlayerId | "neutral"> = {};
    for (let i = 0; i < 10; i++) ownership[`t${i}`] = P1;
    const state = makeState(ownership);
    const map = makeMap(Object.keys(ownership));
    const result = calculateReinforcements(state, P1, map);
    expect(result.total).toBe(3);
    expect(result.sources.territory).toBe(3);
  });

  test("12 territories gives 4 (floor(12/3)=4)", () => {
    const ownership: Record<string, PlayerId | "neutral"> = {};
    for (let i = 0; i < 12; i++) ownership[`t${i}`] = P1;
    const state = makeState(ownership);
    const map = makeMap(Object.keys(ownership));
    const result = calculateReinforcements(state, P1, map);
    expect(result.total).toBe(4);
    expect(result.sources.territory).toBe(4);
  });

  test("42 territories (classic full board) gives 14", () => {
    const ownership: Record<string, PlayerId | "neutral"> = {};
    for (let i = 0; i < 42; i++) ownership[`t${i}`] = P1;
    const state = makeState(ownership);
    const map = makeMap(Object.keys(ownership));
    const result = calculateReinforcements(state, P1, map);
    expect(result.total).toBe(14);
    expect(result.sources.territory).toBe(14);
  });

  test("continent bonus when fully controlled", () => {
    const ownership: Record<string, PlayerId | "neutral"> = {
      t1: P1,
      t2: P1,
      t3: P1,
      t4: P2,
    };
    const map = makeMap(["t1", "t2", "t3", "t4"], {
      asia: { territoryIds: ["t1", "t2", "t3"], bonus: 7 },
    });
    const result = calculateReinforcements(state(), P1, map);

    function state() {
      return makeState(ownership);
    }

    // 3 territories → base 3, + asia bonus 7 = 10
    expect(result.total).toBe(10);
    expect(result.sources.territory).toBe(3);
    expect(result.sources.asia).toBe(7);
  });

  test("no continent bonus when not fully controlled", () => {
    const ownership: Record<string, PlayerId | "neutral"> = {
      t1: P1,
      t2: P2, // breaks continent control
      t3: P1,
    };
    const map = makeMap(["t1", "t2", "t3"], {
      europe: { territoryIds: ["t1", "t2", "t3"], bonus: 5 },
    });
    const result = calculateReinforcements(makeState(ownership), P1, map);
    expect(result.total).toBe(3);
    expect(result.sources.territory).toBe(3);
    expect(result.sources.europe).toBeUndefined();
  });

  test("multiple continent bonuses", () => {
    const ownership: Record<string, PlayerId | "neutral"> = {};
    // 6 territories in 2 continents, all owned by P1
    for (let i = 0; i < 6; i++) ownership[`t${i}`] = P1;
    ownership["t6"] = P2; // extra territory

    const map = makeMap(Object.keys(ownership), {
      NA: { territoryIds: ["t0", "t1", "t2"], bonus: 5 },
      SA: { territoryIds: ["t3", "t4", "t5"], bonus: 2 },
    });
    const result = calculateReinforcements(makeState(ownership), P1, map);
    // 6 territories → base 3, + NA 5 + SA 2 = 10
    expect(result.total).toBe(10);
    expect(result.sources.territory).toBe(3);
    expect(result.sources.NA).toBe(5);
    expect(result.sources.SA).toBe(2);
  });

  test("neutral-owned territory does not count for any player", () => {
    const ownership: Record<string, PlayerId | "neutral"> = {
      t1: P1,
      t2: "neutral",
      t3: P1,
    };
    const map = makeMap(["t1", "t2", "t3"], {
      c1: { territoryIds: ["t1", "t2", "t3"], bonus: 3 },
    });
    const result = calculateReinforcements(makeState(ownership), P1, map);
    // 2 territories owned, neutral breaks continent
    expect(result.total).toBe(3);
    expect(result.sources.c1).toBeUndefined();
  });

  test("map with no continents defined", () => {
    const ownership: Record<string, PlayerId | "neutral"> = {};
    for (let i = 0; i < 15; i++) ownership[`t${i}`] = P1;
    const map = makeMap(Object.keys(ownership));
    const result = calculateReinforcements(makeState(ownership), P1, map);
    // 15 territories → floor(15/3)=5, no continent bonuses
    expect(result.total).toBe(5);
    expect(result.sources.territory).toBe(5);
    expect(Object.keys(result.sources)).toEqual(["territory"]);
  });
});
