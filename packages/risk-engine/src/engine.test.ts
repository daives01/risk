import { describe, expect, test } from "bun:test";
import { applyAction, ActionError } from "./engine.js";
import type {
  GameState,
  PlayerId,
  TerritoryId,
  PlaceReinforcements,
  ReinforcementsPlaced,
} from "./types.js";

// ── Helpers ────────────────────────────────────────────────────────────

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;
const T1 = "t1" as TerritoryId;
const T2 = "t2" as TerritoryId;
const T3 = "t3" as TerritoryId;

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
    cardsById: {},
    hands: {},
    tradesCompleted: 0,
    capturedThisTurn: false,
    rng: { seed: "test", index: 0 },
    stateVersion: 0,
    rulesetVersion: 1,
    ...overrides,
  };
}

function place(territoryId: TerritoryId, count: number): PlaceReinforcements {
  return { type: "PlaceReinforcements", territoryId, count };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("PlaceReinforcements", () => {
  test("places armies on owned territory", () => {
    const state = makeState();
    const result = applyAction(state, P1, place(T1, 2));

    expect(result.state.territories[T1].armies).toBe(5); // 3 + 2
    expect(result.state.reinforcements?.remaining).toBe(3); // 5 - 2
    expect(result.state.stateVersion).toBe(1);
  });

  test("emits ReinforcementsPlaced event", () => {
    const state = makeState();
    const result = applyAction(state, P1, place(T1, 2));

    expect(result.events).toHaveLength(1);
    const event = result.events[0] as ReinforcementsPlaced;
    expect(event.type).toBe("ReinforcementsPlaced");
    expect(event.playerId).toBe(P1);
    expect(event.territoryId).toBe(T1);
    expect(event.count).toBe(2);
  });

  test("stays in Reinforcement phase when armies remain", () => {
    const state = makeState();
    const result = applyAction(state, P1, place(T1, 3));

    expect(result.state.turn.phase).toBe("Reinforcement");
    expect(result.state.reinforcements?.remaining).toBe(2);
  });

  test("transitions to Attack phase when all reinforcements placed", () => {
    const state = makeState();
    const result = applyAction(state, P1, place(T1, 5));

    expect(result.state.turn.phase).toBe("Attack");
    expect(result.state.reinforcements).toBeUndefined();
  });

  test("can split reinforcements across multiple placements", () => {
    const state = makeState();
    const r1 = applyAction(state, P1, place(T1, 2));
    const r2 = applyAction(r1.state, P1, place(T2, 3));

    expect(r2.state.territories[T1].armies).toBe(5); // 3 + 2
    expect(r2.state.territories[T2].armies).toBe(5); // 2 + 3
    expect(r2.state.turn.phase).toBe("Attack");
    expect(r2.state.reinforcements).toBeUndefined();
    expect(r2.state.stateVersion).toBe(2);
  });

  test("rejects placement on territory not owned by player", () => {
    const state = makeState();
    expect(() => applyAction(state, P1, place(T3, 1))).toThrow(ActionError);
    expect(() => applyAction(state, P1, place(T3, 1))).toThrow(
      /not owned by/,
    );
  });

  test("rejects placement when not in Reinforcement phase", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
    });
    expect(() => applyAction(state, P1, place(T1, 1))).toThrow(ActionError);
    expect(() => applyAction(state, P1, place(T1, 1))).toThrow(
      /current phase is Attack/,
    );
  });

  test("rejects placement when not current player", () => {
    const state = makeState();
    expect(() => applyAction(state, P2, place(T3, 1))).toThrow(ActionError);
    expect(() => applyAction(state, P2, place(T3, 1))).toThrow(
      /Not your turn/,
    );
  });

  test("rejects placement exceeding remaining reinforcements", () => {
    const state = makeState();
    expect(() => applyAction(state, P1, place(T1, 6))).toThrow(ActionError);
    expect(() => applyAction(state, P1, place(T1, 6))).toThrow(
      /only 5 remaining/,
    );
  });

  test("rejects count of 0", () => {
    const state = makeState();
    expect(() => applyAction(state, P1, place(T1, 0))).toThrow(ActionError);
    expect(() => applyAction(state, P1, place(T1, 0))).toThrow(
      /positive integer/,
    );
  });

  test("rejects negative count", () => {
    const state = makeState();
    expect(() => applyAction(state, P1, place(T1, -1))).toThrow(ActionError);
  });

  test("rejects non-integer count", () => {
    const state = makeState();
    expect(() => applyAction(state, P1, place(T1, 1.5))).toThrow(ActionError);
  });

  test("rejects nonexistent territory", () => {
    const state = makeState();
    expect(() =>
      applyAction(state, P1, place("fake" as TerritoryId, 1)),
    ).toThrow(ActionError);
    expect(() =>
      applyAction(state, P1, place("fake" as TerritoryId, 1)),
    ).toThrow(/does not exist/);
  });

  test("does not mutate original state", () => {
    const state = makeState();
    const originalArmies = state.territories[T1].armies;
    const originalRemaining = state.reinforcements?.remaining;

    applyAction(state, P1, place(T1, 2));

    expect(state.territories[T1].armies).toBe(originalArmies);
    expect(state.reinforcements?.remaining).toBe(originalRemaining);
    expect(state.stateVersion).toBe(0);
  });

  test("rejects placement when reinforcements state is missing", () => {
    const state = makeState({ reinforcements: undefined });
    expect(() => applyAction(state, P1, place(T1, 1))).toThrow(ActionError);
    expect(() => applyAction(state, P1, place(T1, 1))).toThrow(
      /only 0 remaining/,
    );
  });
});
