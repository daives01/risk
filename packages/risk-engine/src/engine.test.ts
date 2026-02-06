import { describe, expect, test } from "bun:test";
import { applyAction, ActionError } from "./engine.js";
import type {
  AttackAction,
  AttackResolved,
  EndAttackPhase,
  GameEnded,
  GameState,
  OccupyAction,
  OccupyResolved,
  PlayerEliminated,
  PlayerId,
  PlaceReinforcements,
  ReinforcementsPlaced,
  TerritoryCaptured,
  TerritoryId,
} from "./types.js";
import type { GraphMap } from "./map.js";
import type { CombatConfig } from "./config.js";

// ── Helpers ────────────────────────────────────────────────────────────

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;
const P3 = "p3" as PlayerId;
const T1 = "t1" as TerritoryId;
const T2 = "t2" as TerritoryId;
const T3 = "t3" as TerritoryId;
const T4 = "t4" as TerritoryId;

const testMap: GraphMap = {
  territories: {
    [T1]: {},
    [T2]: {},
    [T3]: {},
    [T4]: {},
  },
  adjacency: {
    [T1]: [T2, T3],
    [T2]: [T1, T3],
    [T3]: [T1, T2],
    [T4]: [], // isolated territory, not adjacent to anything
  },
};

const defaultCombat: CombatConfig = {
  maxAttackDice: 3,
  maxDefendDice: 2,
  defenderDiceStrategy: "alwaysMax",
  allowAttackerDiceChoice: true,
};

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

function makeAttackState(overrides?: Partial<GameState>): GameState {
  return makeState({
    turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
    reinforcements: undefined,
    ...overrides,
  });
}

function place(territoryId: TerritoryId, count: number): PlaceReinforcements {
  return { type: "PlaceReinforcements", territoryId, count };
}

function attack(from: TerritoryId, to: TerritoryId, attackerDice?: number): AttackAction {
  return attackerDice !== undefined
    ? { type: "Attack", from, to, attackerDice }
    : { type: "Attack", from, to };
}

function occupy(moveArmies: number): OccupyAction {
  return { type: "Occupy", moveArmies };
}

function endAttack(): EndAttackPhase {
  return { type: "EndAttackPhase" };
}

function makeOccupyState(overrides?: Partial<GameState>): GameState {
  return makeState({
    turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
    reinforcements: undefined,
    territories: {
      [T1]: { ownerId: P1, armies: 5 },
      [T2]: { ownerId: P1, armies: 2 },
      [T3]: { ownerId: P1, armies: 0 }, // just captured, 0 armies
    },
    pending: { type: "Occupy", from: T1, to: T3, minMove: 2, maxMove: 4 },
    capturedThisTurn: true,
    ...overrides,
  });
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

// ── Attack tests ──────────────────────────────────────────────────────

describe("Attack", () => {
  test("resolves attack with dice rolls and army losses", () => {
    const state = makeAttackState();
    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);

    expect(result.events.length).toBeGreaterThanOrEqual(1);
    const event = result.events[0] as AttackResolved;
    expect(event.type).toBe("AttackResolved");
    expect(event.from).toBe(T1);
    expect(event.to).toBe(T3);
    expect(event.attackRolls.length).toBe(event.attackDice);
    expect(event.defendRolls.length).toBe(event.defendDice);
    expect(event.attackerLosses + event.defenderLosses).toBe(
      Math.min(event.attackDice, event.defendDice),
    );
  });

  test("applies army losses to territories", () => {
    const state = makeAttackState();
    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);

    const event = result.events[0] as AttackResolved;
    expect(result.state.territories[T1].armies).toBe(3 - event.attackerLosses);
    expect(result.state.territories[T3].armies).toBe(4 - event.defenderLosses);
  });

  test("increments stateVersion", () => {
    const state = makeAttackState();
    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);
    expect(result.state.stateVersion).toBe(1);
  });

  test("advances RNG state", () => {
    const state = makeAttackState();
    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);
    expect(result.state.rng.index).toBeGreaterThan(state.rng.index);
  });

  test("is deterministic — same seed produces same result", () => {
    const state = makeAttackState();
    const r1 = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);
    const r2 = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);

    const e1 = r1.events[0] as AttackResolved;
    const e2 = r2.events[0] as AttackResolved;
    expect(e1.attackRolls).toEqual(e2.attackRolls);
    expect(e1.defendRolls).toEqual(e2.defendRolls);
    expect(e1.attackerLosses).toBe(e2.attackerLosses);
    expect(e1.defenderLosses).toBe(e2.defenderLosses);
  });

  test("attacker dice defaults to max allowed", () => {
    // P1 has 3 armies on T1 → can roll min(3, 3-1) = 2 dice
    const state = makeAttackState();
    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);

    const event = result.events[0] as AttackResolved;
    expect(event.attackDice).toBe(2); // min(maxAttackDice=3, armies-1=2) = 2
  });

  test("attacker can choose fewer dice", () => {
    const state = makeAttackState();
    const result = applyAction(state, P1, attack(T1, T3, 1), testMap, defaultCombat);

    const event = result.events[0] as AttackResolved;
    expect(event.attackDice).toBe(1);
  });

  test("defender auto-rolls max dice", () => {
    // P2 has 4 armies on T3 → defender rolls min(2, 4) = 2
    const state = makeAttackState();
    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);

    const event = result.events[0] as AttackResolved;
    expect(event.defendDice).toBe(2);
  });

  test("defender rolls fewer dice when they have fewer armies than maxDefendDice", () => {
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 1 }, // only 1 army
      },
    });
    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);

    const event = result.events[0] as AttackResolved;
    expect(event.defendDice).toBe(1);
  });

  test("captures territory when defender reaches 0 armies", () => {
    // Set up a scenario where defender has 1 army so capture is possible
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 1 },
      },
    });

    // Keep trying different seeds until we get a capture
    let captured = false;
    for (let seed = 0; seed < 100; seed++) {
      const s = { ...state, rng: { seed, index: 0 } };
      const result = applyAction(s, P1, attack(T1, T3), testMap, defaultCombat);
      const attackEvent = result.events[0] as AttackResolved;
      if (attackEvent.defenderLosses === 1) {
        captured = true;
        // Defender lost their only army → captured
        expect(result.state.territories[T3].ownerId).toBe(P1);
        expect(result.state.territories[T3].armies).toBe(0);

        // TerritoryCaptured event emitted
        const captureEvent = result.events[1] as TerritoryCaptured;
        expect(captureEvent.type).toBe("TerritoryCaptured");
        expect(captureEvent.from).toBe(T1);
        expect(captureEvent.to).toBe(T3);
        expect(captureEvent.newOwnerId).toBe(P1);

        // Pending occupy set
        expect(result.state.pending).toBeDefined();
        expect(result.state.pending!.type).toBe("Occupy");
        expect(result.state.pending!.from).toBe(T1);
        expect(result.state.pending!.to).toBe(T3);
        expect(result.state.pending!.minMove).toBeGreaterThanOrEqual(1);
        expect(result.state.pending!.maxMove).toBeGreaterThanOrEqual(result.state.pending!.minMove);

        // capturedThisTurn flag set
        expect(result.state.capturedThisTurn).toBe(true);
        break;
      }
    }
    expect(captured).toBe(true);
  });

  test("sets pending occupy with correct minMove (attackerDice used) and maxMove", () => {
    // Find a seed that produces a capture when attacking with 2 dice
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 1 },
      },
    });

    for (let seed = 0; seed < 100; seed++) {
      const s = { ...state, rng: { seed, index: 0 } };
      const result = applyAction(s, P1, attack(T1, T3, 2), testMap, defaultCombat);
      const attackEvent = result.events[0] as AttackResolved;
      if (attackEvent.defenderLosses === 1) {
        // minMove should be the attacker dice used (2)
        expect(result.state.pending!.minMove).toBe(2);
        // maxMove should be fromArmies - attackerLosses - 1
        expect(result.state.pending!.maxMove).toBe(
          5 - attackEvent.attackerLosses - 1,
        );
        break;
      }
    }
  });

  test("no capture when defender survives", () => {
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 10 }, // lots of defenders
      },
    });

    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);
    const event = result.events[0] as AttackResolved;
    // Defender has 10 armies, losing at most 2 → always survives
    expect(result.state.territories[T3].armies).toBeGreaterThan(0);
    expect(result.state.territories[T3].ownerId).toBe(P2);
    expect(result.state.pending).toBeUndefined();
    expect(result.events).toHaveLength(1); // Only AttackResolved, no capture
  });

  test("can attack neutral territories", () => {
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: "neutral", armies: 1 },
      },
    });

    // Should not throw
    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);
    expect(result.events[0]!.type).toBe("AttackResolved");
  });

  test("stays in Attack phase after attack (no capture)", () => {
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 10 },
      },
    });

    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);
    expect(result.state.turn.phase).toBe("Attack");
  });

  test("does not mutate original state", () => {
    const state = makeAttackState();
    const originalT1Armies = state.territories[T1].armies;
    const originalT3Armies = state.territories[T3].armies;
    const originalRngIndex = state.rng.index;

    applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);

    expect(state.territories[T1].armies).toBe(originalT1Armies);
    expect(state.territories[T3].armies).toBe(originalT3Armies);
    expect(state.rng.index).toBe(originalRngIndex);
    expect(state.stateVersion).toBe(0);
  });

  test("dice rolls are sorted descending", () => {
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 10 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 5 },
      },
    });

    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);
    const event = result.events[0] as AttackResolved;

    for (let i = 1; i < event.attackRolls.length; i++) {
      expect(event.attackRolls[i - 1]).toBeGreaterThanOrEqual(event.attackRolls[i]!);
    }
    for (let i = 1; i < event.defendRolls.length; i++) {
      expect(event.defendRolls[i - 1]).toBeGreaterThanOrEqual(event.defendRolls[i]!);
    }
  });

  // ── Validation error tests ──────────────────────────────────────────

  test("rejects attack when not in Attack phase", () => {
    const state = makeState(); // defaults to Reinforcement phase
    expect(() => applyAction(state, P1, attack(T1, T3), testMap, defaultCombat)).toThrow(
      /current phase is Reinforcement/,
    );
  });

  test("rejects attack when not current player", () => {
    const state = makeAttackState();
    expect(() => applyAction(state, P2, attack(T3, T1), testMap, defaultCombat)).toThrow(
      /Not your turn/,
    );
  });

  test("rejects attack while occupy is pending", () => {
    const state = makeAttackState({
      pending: { type: "Occupy", from: T1, to: T3, minMove: 1, maxMove: 2 },
    });
    expect(() => applyAction(state, P1, attack(T1, T2), testMap, defaultCombat)).toThrow(
      /Occupy is pending/,
    );
  });

  test("rejects attack from nonexistent territory", () => {
    const state = makeAttackState();
    expect(() =>
      applyAction(state, P1, attack("fake" as TerritoryId, T3), testMap, defaultCombat),
    ).toThrow(/does not exist/);
  });

  test("rejects attack to nonexistent territory", () => {
    const state = makeAttackState();
    expect(() =>
      applyAction(state, P1, attack(T1, "fake" as TerritoryId), testMap, defaultCombat),
    ).toThrow(/does not exist/);
  });

  test("rejects attack from territory not owned by player", () => {
    const state = makeAttackState();
    expect(() => applyAction(state, P1, attack(T3, T1), testMap, defaultCombat)).toThrow(
      /not owned by/,
    );
  });

  test("rejects attack on own territory", () => {
    const state = makeAttackState();
    expect(() => applyAction(state, P1, attack(T1, T2), testMap, defaultCombat)).toThrow(
      /Cannot attack your own territory/,
    );
  });

  test("rejects attack on non-adjacent territory", () => {
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 4 },
        [T4]: { ownerId: P2, armies: 3 },
      },
    });
    expect(() => applyAction(state, P1, attack(T1, T4), testMap, defaultCombat)).toThrow(
      /not adjacent/,
    );
  });

  test("rejects attack from territory with only 1 army", () => {
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 1 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 4 },
      },
    });
    expect(() => applyAction(state, P1, attack(T1, T3), testMap, defaultCombat)).toThrow(
      /at least 2 armies/,
    );
  });

  test("rejects attacker dice exceeding maximum", () => {
    // T1 has 3 armies → max dice is min(3, 3-1) = 2
    const state = makeAttackState();
    expect(() =>
      applyAction(state, P1, attack(T1, T3, 3), testMap, defaultCombat),
    ).toThrow(/maximum is 2/);
  });

  test("rejects attacker dice of 0", () => {
    const state = makeAttackState();
    expect(() =>
      applyAction(state, P1, attack(T1, T3, 0), testMap, defaultCombat),
    ).toThrow(/positive integer/);
  });

  test("rejects non-integer attacker dice", () => {
    const state = makeAttackState();
    expect(() =>
      applyAction(state, P1, attack(T1, T3, 1.5), testMap, defaultCombat),
    ).toThrow(/positive integer/);
  });

  test("rejects attacker dice choice when not allowed by config", () => {
    const noDiceChoice: CombatConfig = {
      ...defaultCombat,
      allowAttackerDiceChoice: false,
    };
    const state = makeAttackState();
    expect(() =>
      applyAction(state, P1, attack(T1, T3, 1), testMap, noDiceChoice),
    ).toThrow(/not allowed by ruleset/);
  });

  test("throws when map is not provided", () => {
    const state = makeAttackState();
    expect(() => applyAction(state, P1, attack(T1, T3))).toThrow(
      /GraphMap is required/,
    );
  });

  test("throws when combat config is not provided", () => {
    const state = makeAttackState();
    expect(() =>
      applyAction(state, P1, attack(T1, T3), testMap),
    ).toThrow(/CombatConfig is required/);
  });
});

// ── Occupy tests ─────────────────────────────────────────────────────

describe("Occupy", () => {
  test("moves armies from source to captured territory", () => {
    const state = makeOccupyState();
    const result = applyAction(state, P1, occupy(3));

    expect(result.state.territories[T1].armies).toBe(2); // 5 - 3
    expect(result.state.territories[T3].armies).toBe(3); // 0 + 3
  });

  test("emits OccupyResolved event", () => {
    const state = makeOccupyState();
    const result = applyAction(state, P1, occupy(2));

    expect(result.events).toHaveLength(1);
    const event = result.events[0] as OccupyResolved;
    expect(event.type).toBe("OccupyResolved");
    expect(event.from).toBe(T1);
    expect(event.to).toBe(T3);
    expect(event.moved).toBe(2);
  });

  test("clears pending state after occupy", () => {
    const state = makeOccupyState();
    const result = applyAction(state, P1, occupy(2));

    expect(result.state.pending).toBeUndefined();
  });

  test("stays in Attack phase after occupy", () => {
    const state = makeOccupyState();
    const result = applyAction(state, P1, occupy(2));

    expect(result.state.turn.phase).toBe("Attack");
  });

  test("increments stateVersion", () => {
    const state = makeOccupyState();
    const result = applyAction(state, P1, occupy(2));

    expect(result.state.stateVersion).toBe(1);
  });

  test("accepts minMove exactly", () => {
    const state = makeOccupyState();
    const result = applyAction(state, P1, occupy(2)); // minMove = 2

    expect(result.state.territories[T1].armies).toBe(3); // 5 - 2
    expect(result.state.territories[T3].armies).toBe(2); // 0 + 2
  });

  test("accepts maxMove exactly", () => {
    const state = makeOccupyState();
    const result = applyAction(state, P1, occupy(4)); // maxMove = 4

    expect(result.state.territories[T1].armies).toBe(1); // 5 - 4
    expect(result.state.territories[T3].armies).toBe(4); // 0 + 4
  });

  test("preserves capturedThisTurn flag", () => {
    const state = makeOccupyState();
    const result = applyAction(state, P1, occupy(2));

    expect(result.state.capturedThisTurn).toBe(true);
  });

  test("does not mutate original state", () => {
    const state = makeOccupyState();
    const originalT1Armies = state.territories[T1].armies;
    const originalT3Armies = state.territories[T3].armies;

    applyAction(state, P1, occupy(3));

    expect(state.territories[T1].armies).toBe(originalT1Armies);
    expect(state.territories[T3].armies).toBe(originalT3Armies);
    expect(state.pending).toBeDefined();
    expect(state.stateVersion).toBe(0);
  });

  // ── Validation error tests ──────────────────────────────────────────

  test("rejects occupy when no pending occupy", () => {
    const state = makeAttackState();
    expect(() => applyAction(state, P1, occupy(1))).toThrow(
      /No pending Occupy/,
    );
  });

  test("rejects occupy when not current player", () => {
    const state = makeOccupyState();
    expect(() => applyAction(state, P2, occupy(2))).toThrow(
      /Not your turn/,
    );
  });

  test("rejects moveArmies below minMove", () => {
    const state = makeOccupyState(); // minMove = 2
    expect(() => applyAction(state, P1, occupy(1))).toThrow(
      /at least 2/,
    );
  });

  test("rejects moveArmies above maxMove", () => {
    const state = makeOccupyState(); // maxMove = 4
    expect(() => applyAction(state, P1, occupy(5))).toThrow(
      /more than 4/,
    );
  });

  test("rejects non-integer moveArmies", () => {
    const state = makeOccupyState();
    expect(() => applyAction(state, P1, occupy(2.5))).toThrow(
      /must be an integer/,
    );
  });

  test("works in end-to-end attack → occupy flow", () => {
    // Set up a scenario where capture happens, then resolve the occupy
    // P2 must have another territory so game doesn't end on elimination
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 1 },
        [T4]: { ownerId: P2, armies: 3 },
      },
    });

    // Find a seed that produces a capture
    for (let seed = 0; seed < 100; seed++) {
      const s = { ...state, rng: { seed, index: 0 } };
      const attackResult = applyAction(s, P1, attack(T1, T3), testMap, defaultCombat);
      const attackEvent = attackResult.events[0] as AttackResolved;

      if (attackEvent.defenderLosses === 1) {
        // Territory captured → pending occupy set
        expect(attackResult.state.pending).toBeDefined();

        const pending = attackResult.state.pending!;
        // Resolve the occupy with minimum move
        const occupyResult = applyAction(attackResult.state, P1, occupy(pending.minMove));

        // Verify armies moved correctly
        expect(occupyResult.state.territories[T3].armies).toBe(pending.minMove);
        expect(occupyResult.state.territories[T1].armies).toBe(
          attackResult.state.territories[T1].armies - pending.minMove,
        );

        // Pending cleared, still in Attack phase
        expect(occupyResult.state.pending).toBeUndefined();
        expect(occupyResult.state.turn.phase).toBe("Attack");

        // OccupyResolved event
        const occupyEvent = occupyResult.events[0] as OccupyResolved;
        expect(occupyEvent.type).toBe("OccupyResolved");
        expect(occupyEvent.moved).toBe(pending.minMove);
        return;
      }
    }
    throw new Error("No capture occurred in 100 seeds");
  });
});

// ── EndAttackPhase tests ────────────────────────────────────────────

describe("EndAttackPhase", () => {
  test("transitions from Attack to Fortify phase", () => {
    const state = makeAttackState();
    const result = applyAction(state, P1, endAttack());

    expect(result.state.turn.phase).toBe("Fortify");
    expect(result.state.stateVersion).toBe(1);
  });

  test("emits no events", () => {
    const state = makeAttackState();
    const result = applyAction(state, P1, endAttack());

    expect(result.events).toHaveLength(0);
  });

  test("does not mutate original state", () => {
    const state = makeAttackState();
    applyAction(state, P1, endAttack());

    expect(state.turn.phase).toBe("Attack");
    expect(state.stateVersion).toBe(0);
  });

  test("rejects when not in Attack phase", () => {
    const state = makeState(); // Reinforcement phase
    expect(() => applyAction(state, P1, endAttack())).toThrow(
      /current phase is Reinforcement/,
    );
  });

  test("rejects when not current player", () => {
    const state = makeAttackState();
    expect(() => applyAction(state, P2, endAttack())).toThrow(
      /Not your turn/,
    );
  });

  test("rejects when occupy is pending", () => {
    const state = makeOccupyState();
    expect(() => applyAction(state, P1, endAttack())).toThrow(
      /Occupy is pending/,
    );
  });
});

// ── Player elimination tests ────────────────────────────────────────

describe("Player elimination", () => {
  test("marks defender as defeated when they lose their last territory", () => {
    // P2 owns only T3, which has 1 army — if captured, P2 is eliminated
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 1 },
      },
    });

    // Find a seed that captures
    for (let seed = 0; seed < 100; seed++) {
      const s = { ...state, rng: { seed, index: 0 } };
      const result = applyAction(s, P1, attack(T1, T3), testMap, defaultCombat);
      const attackEvent = result.events[0] as AttackResolved;

      if (attackEvent.defenderLosses === 1) {
        // P2 should be defeated
        expect(result.state.players["p2"]!.status).toBe("defeated");

        // PlayerEliminated event emitted
        const elimEvent = result.events.find(
          (e) => e.type === "PlayerEliminated",
        ) as PlayerEliminated;
        expect(elimEvent).toBeDefined();
        expect(elimEvent.eliminatedId).toBe(P2);
        expect(elimEvent.byId).toBe(P1);
        expect(elimEvent.cardsTransferred).toEqual([]);
        return;
      }
    }
    throw new Error("No capture occurred in 100 seeds");
  });

  test("does not mark defender as defeated when they have other territories", () => {
    // P2 owns T3 and T4, losing T3 should not eliminate them
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 1 },
        [T4]: { ownerId: P2, armies: 3 },
      },
    });

    for (let seed = 0; seed < 100; seed++) {
      const s = { ...state, rng: { seed, index: 0 } };
      const result = applyAction(s, P1, attack(T1, T3), testMap, defaultCombat);
      const attackEvent = result.events[0] as AttackResolved;

      if (attackEvent.defenderLosses === 1) {
        // P2 should still be alive
        expect(result.state.players["p2"]!.status).toBe("alive");

        // No PlayerEliminated event
        const elimEvent = result.events.find(
          (e) => e.type === "PlayerEliminated",
        );
        expect(elimEvent).toBeUndefined();
        return;
      }
    }
    throw new Error("No capture occurred in 100 seeds");
  });

  test("does not emit elimination for neutral territories", () => {
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: "neutral", armies: 1 },
      },
    });

    for (let seed = 0; seed < 100; seed++) {
      const s = { ...state, rng: { seed, index: 0 } };
      const result = applyAction(s, P1, attack(T1, T3), testMap, defaultCombat);
      const attackEvent = result.events[0] as AttackResolved;

      if (attackEvent.defenderLosses === 1) {
        // No PlayerEliminated event for neutral
        const elimEvent = result.events.find(
          (e) => e.type === "PlayerEliminated",
        );
        expect(elimEvent).toBeUndefined();
        return;
      }
    }
    throw new Error("No capture occurred in 100 seeds");
  });
});

// ── Win condition tests ─────────────────────────────────────────────

describe("Win condition", () => {
  test("game ends when only 1 alive player remains (2-player game)", () => {
    // P2 owns only T3 — capturing it eliminates P2 and P1 wins
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 1 },
      },
    });

    for (let seed = 0; seed < 100; seed++) {
      const s = { ...state, rng: { seed, index: 0 } };
      const result = applyAction(s, P1, attack(T1, T3), testMap, defaultCombat);
      const attackEvent = result.events[0] as AttackResolved;

      if (attackEvent.defenderLosses === 1) {
        // Game should be over
        expect(result.state.turn.phase).toBe("GameOver");

        // GameEnded event
        const gameEndedEvent = result.events.find(
          (e) => e.type === "GameEnded",
        ) as GameEnded;
        expect(gameEndedEvent).toBeDefined();
        expect(gameEndedEvent.winningPlayerId).toBe(P1);

        // Event order: AttackResolved, TerritoryCaptured, PlayerEliminated, GameEnded
        const types = result.events.map((e) => e.type);
        expect(types).toEqual([
          "AttackResolved",
          "TerritoryCaptured",
          "PlayerEliminated",
          "GameEnded",
        ]);
        return;
      }
    }
    throw new Error("No capture occurred in 100 seeds");
  });

  test("game does not end when 2+ players remain alive (3-player game)", () => {
    // P2 owns only T3, but P3 is alive with T4
    const state = makeAttackState({
      players: {
        p1: { status: "alive" },
        p2: { status: "alive" },
        p3: { status: "alive" },
      },
      turnOrder: [P1, P2, P3],
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 1 },
        [T4]: { ownerId: P3, armies: 3 },
      },
    });

    for (let seed = 0; seed < 100; seed++) {
      const s = { ...state, rng: { seed, index: 0 } };
      const result = applyAction(s, P1, attack(T1, T3), testMap, defaultCombat);
      const attackEvent = result.events[0] as AttackResolved;

      if (attackEvent.defenderLosses === 1) {
        // P2 eliminated but game continues — P3 still alive
        expect(result.state.players["p2"]!.status).toBe("defeated");
        expect(result.state.turn.phase).toBe("Attack"); // not GameOver

        const gameEndedEvent = result.events.find(
          (e) => e.type === "GameEnded",
        );
        expect(gameEndedEvent).toBeUndefined();
        return;
      }
    }
    throw new Error("No capture occurred in 100 seeds");
  });

  test("game does not end when already-defeated player has 0 territories", () => {
    // P2 already defeated, P3 alive — eliminating nobody new
    const state = makeAttackState({
      players: {
        p1: { status: "alive" },
        p2: { status: "defeated" },
        p3: { status: "alive" },
      },
      turnOrder: [P1, P2, P3],
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P3, armies: 10 }, // P3 has lots of armies, won't be captured
      },
    });

    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat);
    // No elimination should happen since T3 won't be captured (10 armies)
    expect(result.state.turn.phase).toBe("Attack");
    const elimEvent = result.events.find((e) => e.type === "PlayerEliminated");
    expect(elimEvent).toBeUndefined();
  });
});
