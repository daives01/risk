import { describe, expect, test } from "bun:test";
import { readGameState, readGameStateNullable, readGraphMap } from "./typeAdapters";

function graphFixture() {
  return {
    territories: {
      a: { name: "Alpha", continentId: "north", tags: ["coast"] },
      b: {},
    },
    adjacency: { a: ["b"], b: ["a"] },
    continents: { north: { territoryIds: ["a"], bonus: 2 } },
    authoredBy: "fixture",
  };
}

function stateFixture() {
  return {
    players: { p1: { status: "alive", teamId: "red" }, p2: { status: "defeated" } },
    turnOrder: ["p1"],
    territories: { a: { ownerId: "p1", armies: 3 }, b: { ownerId: "neutral", armies: 1 } },
    turn: { currentPlayerId: "p1", phase: "Attack", round: 2 },
    pending: { type: "Occupy", from: "a", to: "b", minMove: 1, maxMove: 2 },
    reinforcements: { remaining: 3, sources: { territories: 3 } },
    deck: { draw: ["c1"], discard: ["c2"] },
    cardsById: { c1: { kind: "A", territoryId: "a" }, c2: { kind: "W" } },
    hands: { p1: ["c3"], p2: [] },
    tradesCompleted: 1,
    capturedThisTurn: false,
    fortifiesUsedThisTurn: 0,
    rng: { seed: "test-seed", index: 4 },
    stateVersion: 8,
    rulesetVersion: 1,
    legacyMetadata: { retained: true },
  };
}

describe("readGraphMap boundary", () => {
  test("retains valid nested data, extra properties and identity without mutation", () => {
    const source = graphFixture();
    const before = structuredClone(source);
    Object.freeze(source);
    expect(Object.is(readGraphMap(source), source)).toBe(true);
    expect(source).toEqual(before);
    expect(readGraphMap({ territories: {}, adjacency: {} })).toEqual({ territories: {}, adjacency: {} });
    expect(readGraphMap({ territories: { a: { name: undefined } }, adjacency: {}, continents: undefined }).continents).toBeUndefined();
  });

  test("leaves graph consistency checks to the engine", () => {
    const disconnected = { territories: {}, adjacency: { absent: ["also-absent"] } };
    expect(Object.is(readGraphMap(disconnected), disconnected)).toBe(true);
  });

  test.each([
    null,
    [],
    { ...graphFixture(), territories: [] },
    { ...graphFixture(), territories: { a: null } },
    { ...graphFixture(), territories: { a: { name: 1 } } },
    { ...graphFixture(), territories: { a: { continentId: null } } },
    { ...graphFixture(), territories: { a: { tags: [1] } } },
    { ...graphFixture(), adjacency: { a: "b" } },
    { ...graphFixture(), adjacency: { a: ["b", null] } },
    { ...graphFixture(), adjacency: { a: new Array(1) } },
    { ...graphFixture(), continents: [] },
    { ...graphFixture(), continents: { north: { territoryIds: [1], bonus: 2 } } },
    { ...graphFixture(), continents: { north: { territoryIds: ["a"], bonus: "2" } } },
  ].map((value) => ({ value })))("rejects malformed nested map data %#", ({ value }) => {
    expect(() => readGraphMap(value)).toThrow("Invalid map data");
  });
});

describe("readGameState boundary", () => {
  test("retains valid data and extra fields without mutation", () => {
    const source = stateFixture();
    const before = structuredClone(source);
    Object.freeze(source);
    expect(Object.is(readGameState(source), source)).toBe(true);
    expect(source).toEqual(before);
  });

  test("accepts optional fields absent or undefined and both seed types", () => {
    const { pending, reinforcements, fortifiesUsedThisTurn, ...minimal } = stateFixture();
    expect(Object.is(readGameState(minimal), minimal)).toBe(true);
    const explicitUndefined = {
      ...minimal,
      pending: undefined,
      reinforcements: undefined,
      fortifiesUsedThisTurn: undefined,
      rng: { seed: 123, index: 0 },
    };
    expect(Object.is(readGameState(explicitUndefined), explicitUndefined)).toBe(true);
    expect(readGameState({ ...minimal, reinforcements: { remaining: 0 } }).reinforcements?.remaining).toBe(0);
    expect(Object.is(readGameState({ ...minimal, pending, reinforcements, fortifiesUsedThisTurn }).pending, pending)).toBe(true);
  });

  test.each(["Setup", "Reinforcement", "Attack", "Occupy", "Fortify", "GameOver"])(
    "accepts phase %s without adding cross-field game rules", (phase) => {
      const value = { ...stateFixture(), turn: { currentPlayerId: "not-in-players", phase, round: -1 } };
      expect(Object.is(readGameState(value), value)).toBe(true);
    },
  );

  test("nullable reader normalizes only null and undefined", () => {
    expect(readGameStateNullable(null)).toBeNull();
    expect(readGameStateNullable(undefined)).toBeNull();
    const state = stateFixture();
    expect(Object.is(readGameStateNullable(state), state)).toBe(true);
    expect(() => readGameStateNullable(false)).toThrow("Invalid game state");
  });

  test.each([
    null,
    [],
    { turn: {}, territories: {} },
    { ...stateFixture(), players: [] },
    { ...stateFixture(), players: { p1: { status: "spectator" } } },
    { ...stateFixture(), players: { p1: { status: "alive", teamId: 1 } } },
    { ...stateFixture(), turnOrder: [1] },
    { ...stateFixture(), territories: { a: { ownerId: null, armies: 2 } } },
    { ...stateFixture(), territories: { a: { ownerId: "p1", armies: "2" } } },
    { ...stateFixture(), turn: [] },
    { ...stateFixture(), turn: { currentPlayerId: 1, phase: "Attack", round: 1 } },
    { ...stateFixture(), turn: { currentPlayerId: "p1", phase: "invalid", round: 1 } },
    { ...stateFixture(), turn: { currentPlayerId: "p1", phase: "Attack", round: null } },
    { ...stateFixture(), pending: null },
    { ...stateFixture(), pending: { type: "Attack", from: "a", to: "b", minMove: 1, maxMove: 2 } },
    { ...stateFixture(), pending: { type: "Occupy", from: 1, to: "b", minMove: 1, maxMove: 2 } },
    { ...stateFixture(), reinforcements: { remaining: 3, sources: { territories: "3" } } },
    { ...stateFixture(), deck: { draw: [1], discard: [] } },
    { ...stateFixture(), deck: { draw: [], discard: "c1" } },
    { ...stateFixture(), cardsById: { c1: { kind: "invalid" } } },
    { ...stateFixture(), cardsById: { c1: { kind: "A", territoryId: false } } },
    { ...stateFixture(), hands: { p1: [null] } },
    { ...stateFixture(), tradesCompleted: "1" },
    { ...stateFixture(), capturedThisTurn: 1 },
    { ...stateFixture(), fortifiesUsedThisTurn: null },
    { ...stateFixture(), rng: { seed: null, index: 0 } },
    { ...stateFixture(), rng: { seed: 1, index: "0" } },
    { ...stateFixture(), stateVersion: undefined },
    { ...stateFixture(), rulesetVersion: "1" },
  ].map((value) => ({ value })))("rejects malformed nested game state %#", ({ value }) => {
    expect(() => readGameState(value)).toThrow("Invalid game state");
  });
});
