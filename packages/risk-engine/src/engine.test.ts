import { describe, expect, test } from "bun:test";
import { applyAction, ActionError } from "./engine.js";
import type {
  AttackAction,
  AttackResolved,
  CardDrawn,
  CardId,
  EndAttackPhase,
  EndTurn,
  Fortify,
  FortifyResolved,
  GameEnded,
  GameState,
  OccupyAction,
  OccupyResolved,
  PlayerEliminated,
  PlayerId,
  TeamId,
  PlaceReinforcements,
  ReinforcementsGranted,
  ReinforcementsPlaced,
  TerritoryCaptured,
  TerritoryId,
  TurnAdvanced,
  TurnEnded,
} from "./types.js";
import type { GraphMap } from "./map.js";
import type { CombatConfig, CardsConfig, FortifyConfig, TeamsConfig } from "./config.js";
import { defaultRuleset } from "./config.js";

// ── Helpers ────────────────────────────────────────────────────────────

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;
const P3 = "p3" as PlayerId;
const T1 = "t1" as TerritoryId;
const T2 = "t2" as TerritoryId;
const T3 = "t3" as TerritoryId;
const T4 = "t4" as TerritoryId;
const T5 = "t5" as TerritoryId;
const T6 = "t6" as TerritoryId;

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

  test("team game ends with winningTeamId when last enemy team is eliminated", () => {
    const teamA = "teamA" as TeamId;
    const teamB = "teamB" as TeamId;
    const teamsConfig: TeamsConfig = {
      teamsEnabled: true,
      preventAttackingTeammates: true,
      allowPlaceOnTeammate: true,
      allowFortifyWithTeammate: true,
      allowFortifyThroughTeammates: true,
      winCondition: "lastTeamStanding",
      continentBonusRecipient: "majorityHolderOnTeam",
    };

    const state = makeAttackState({
      players: {
        p1: { status: "alive", teamId: teamA },
        p2: { status: "alive", teamId: teamA },
        p3: { status: "alive", teamId: teamB },
      },
      turnOrder: [P1, P2, P3],
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P2, armies: 2 },
        [T3]: { ownerId: P3, armies: 1 },
      },
    });

    for (let seed = 0; seed < 100; seed++) {
      const s = { ...state, rng: { seed, index: 0 } };
      const result = applyAction(
        s,
        P1,
        attack(T1, T3),
        testMap,
        defaultCombat,
        undefined,
        undefined,
        teamsConfig,
      );
      const attackEvent = result.events[0] as AttackResolved;
      if (attackEvent.defenderLosses !== 1) continue;

      expect(result.state.turn.phase).toBe("GameOver");
      const gameEndedEvent = result.events.find((e) => e.type === "GameEnded") as GameEnded;
      expect(gameEndedEvent.winningTeamId).toBe(teamA);
      expect(gameEndedEvent.winningPlayerId).toBeUndefined();
      return;
    }

    throw new Error("No capture occurred in 100 seeds");
  });
});

// ── Fortify tests ──────────────────────────────────────────────────

// Chain map: T1 — T2 — T3 — T5, with T4 isolated, T6 connected to T5
const fortifyMap: GraphMap = {
  territories: {
    [T1]: {},
    [T2]: {},
    [T3]: {},
    [T4]: {},
    [T5]: {},
    [T6]: {},
  },
  adjacency: {
    [T1]: [T2],
    [T2]: [T1, T3],
    [T3]: [T2, T5],
    [T4]: [], // isolated
    [T5]: [T3, T6],
    [T6]: [T5],
  },
};

const connectedFortify: FortifyConfig = {
  fortifyMode: "connected",
  maxFortifiesPerTurn: Number.MAX_SAFE_INTEGER,
  allowFortifyWithTeammate: false,
  allowFortifyThroughTeammates: false,
};

const adjacentFortify: FortifyConfig = {
  fortifyMode: "adjacent",
  maxFortifiesPerTurn: Number.MAX_SAFE_INTEGER,
  allowFortifyWithTeammate: false,
  allowFortifyThroughTeammates: false,
};

function makeFortifyState(overrides?: Partial<GameState>): GameState {
  return makeState({
    turn: { currentPlayerId: P1, phase: "Fortify", round: 1 },
    reinforcements: undefined,
    territories: {
      [T1]: { ownerId: P1, armies: 5 },
      [T2]: { ownerId: P1, armies: 3 },
      [T3]: { ownerId: P1, armies: 2 },
      [T4]: { ownerId: P2, armies: 4 },
      [T5]: { ownerId: P1, armies: 1 },
      [T6]: { ownerId: P1, armies: 2 },
    },
    ...overrides,
  });
}

function fortify(from: TerritoryId, to: TerritoryId, count: number): Fortify {
  return { type: "Fortify", from, to, count };
}

describe("Fortify", () => {
  // ── Connected mode (default) ─────────────────────────────────────

  test("moves armies between adjacent territories (connected mode)", () => {
    const state = makeFortifyState();
    const result = applyAction(state, P1, fortify(T1, T2, 2), fortifyMap, undefined, connectedFortify);

    expect(result.state.territories[T1].armies).toBe(3); // 5 - 2
    expect(result.state.territories[T2].armies).toBe(5); // 3 + 2
  });

  test("moves armies through connected path (T1→T3 via T2)", () => {
    const state = makeFortifyState();
    const result = applyAction(state, P1, fortify(T1, T3, 3), fortifyMap, undefined, connectedFortify);

    expect(result.state.territories[T1].armies).toBe(2); // 5 - 3
    expect(result.state.territories[T3].armies).toBe(5); // 2 + 3
  });

  test("moves armies through long connected path (T1→T5 via T2→T3)", () => {
    const state = makeFortifyState();
    const result = applyAction(state, P1, fortify(T1, T5, 2), fortifyMap, undefined, connectedFortify);

    expect(result.state.territories[T1].armies).toBe(3); // 5 - 2
    expect(result.state.territories[T5].armies).toBe(3); // 1 + 2
  });

  test("rejects connected fortify when path is broken by enemy territory", () => {
    const state = makeFortifyState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P2, armies: 3 },
        [T3]: { ownerId: P1, armies: 2 },
        [T4]: { ownerId: P2, armies: 4 },
        [T5]: { ownerId: P1, armies: 1 },
        [T6]: { ownerId: P1, armies: 2 },
      },
    });

    expect(() =>
      applyAction(state, P1, fortify(T1, T3, 1), fortifyMap, undefined, connectedFortify),
    ).toThrow(/No connected path/);
  });

  test("rejects fortify to isolated territory (no connection)", () => {
    const state = makeFortifyState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 3 },
        [T3]: { ownerId: P1, armies: 2 },
        [T4]: { ownerId: P1, armies: 4 },
        [T5]: { ownerId: P1, armies: 1 },
        [T6]: { ownerId: P1, armies: 2 },
      },
    });

    expect(() =>
      applyAction(state, P1, fortify(T1, T4, 1), fortifyMap, undefined, connectedFortify),
    ).toThrow(/No connected path/);
  });

  // ── Adjacent mode ────────────────────────────────────────────────

  test("moves armies between adjacent territories (adjacent mode)", () => {
    const state = makeFortifyState();
    const result = applyAction(state, P1, fortify(T1, T2, 2), fortifyMap, undefined, adjacentFortify);

    expect(result.state.territories[T1].armies).toBe(3); // 5 - 2
    expect(result.state.territories[T2].armies).toBe(5); // 3 + 2
  });

  test("rejects non-adjacent fortify in adjacent mode", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P1, fortify(T1, T3, 1), fortifyMap, undefined, adjacentFortify),
    ).toThrow(/not adjacent/);
  });

  // ── Event emission ───────────────────────────────────────────────

  test("emits FortifyResolved event", () => {
    const state = makeFortifyState();
    const result = applyAction(state, P1, fortify(T1, T2, 2), fortifyMap, undefined, connectedFortify);

    expect(result.events).toHaveLength(1);
    const event = result.events[0] as FortifyResolved;
    expect(event.type).toBe("FortifyResolved");
    expect(event.from).toBe(T1);
    expect(event.to).toBe(T2);
    expect(event.moved).toBe(2);
  });

  test("increments stateVersion", () => {
    const state = makeFortifyState();
    const result = applyAction(state, P1, fortify(T1, T2, 2), fortifyMap, undefined, connectedFortify);
    expect(result.state.stateVersion).toBe(1);
  });

  // ── Validation errors ────────────────────────────────────────────

  test("rejects when not in Fortify phase", () => {
    const state = makeAttackState();
    expect(() =>
      applyAction(state, P1, fortify(T1, T2, 1), fortifyMap, undefined, connectedFortify),
    ).toThrow(/current phase is Attack/);
  });

  test("rejects when not current player", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P2, fortify(T1, T2, 1), fortifyMap, undefined, connectedFortify),
    ).toThrow(/Not your turn/);
  });

  test("rejects nonexistent source territory", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P1, fortify("fake" as TerritoryId, T2, 1), fortifyMap, undefined, connectedFortify),
    ).toThrow(/does not exist/);
  });

  test("rejects nonexistent destination territory", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P1, fortify(T1, "fake" as TerritoryId, 1), fortifyMap, undefined, connectedFortify),
    ).toThrow(/does not exist/);
  });

  test("rejects when source not owned by player", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P1, fortify(T4, T1, 1), fortifyMap, undefined, connectedFortify),
    ).toThrow(/not owned by/);
  });

  test("rejects when destination not owned by player", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P1, fortify(T1, T4, 1), fortifyMap, undefined, connectedFortify),
    ).toThrow(/not owned by/);
  });

  test("rejects fortify to same territory", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P1, fortify(T1, T1, 1), fortifyMap, undefined, connectedFortify),
    ).toThrow(/to itself/);
  });

  test("rejects count of 0", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P1, fortify(T1, T2, 0), fortifyMap, undefined, connectedFortify),
    ).toThrow(/positive integer/);
  });

  test("rejects negative count", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P1, fortify(T1, T2, -1), fortifyMap, undefined, connectedFortify),
    ).toThrow(/positive integer/);
  });

  test("rejects non-integer count", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P1, fortify(T1, T2, 1.5), fortifyMap, undefined, connectedFortify),
    ).toThrow(/positive integer/);
  });

  test("rejects moving all armies (must leave at least 1)", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P1, fortify(T1, T2, 5), fortifyMap, undefined, connectedFortify),
    ).toThrow(/must leave at least 1/);
  });

  test("rejects moving more armies than available", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P1, fortify(T1, T2, 6), fortifyMap, undefined, connectedFortify),
    ).toThrow(/must leave at least 1/);
  });

  test("allows moving exactly armies - 1", () => {
    const state = makeFortifyState();
    const result = applyAction(state, P1, fortify(T1, T2, 4), fortifyMap, undefined, connectedFortify);
    expect(result.state.territories[T1].armies).toBe(1);
    expect(result.state.territories[T2].armies).toBe(7); // 3 + 4
  });

  test("throws when map is not provided", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P1, fortify(T1, T2, 1), undefined, undefined, connectedFortify),
    ).toThrow(/GraphMap is required/);
  });

  test("throws when fortify config is not provided", () => {
    const state = makeFortifyState();
    expect(() =>
      applyAction(state, P1, fortify(T1, T2, 1), fortifyMap),
    ).toThrow(/FortifyConfig is required/);
  });

  // ── Immutability ─────────────────────────────────────────────────

  test("does not mutate original state", () => {
    const state = makeFortifyState();
    const originalT1Armies = state.territories[T1].armies;
    const originalT2Armies = state.territories[T2].armies;

    applyAction(state, P1, fortify(T1, T2, 2), fortifyMap, undefined, connectedFortify);

    expect(state.territories[T1].armies).toBe(originalT1Armies);
    expect(state.territories[T2].armies).toBe(originalT2Armies);
    expect(state.stateVersion).toBe(0);
  });

  test("enforces zero fortify cap", () => {
    const state = makeFortifyState();
    const config: FortifyConfig = { ...connectedFortify, maxFortifiesPerTurn: 0 };
    expect(() =>
      applyAction(state, P1, fortify(T1, T2, 1), fortifyMap, undefined, config),
    ).toThrow(/reached max fortifies per turn/);
  });

  test("enforces one fortify cap and tracks per-turn usage", () => {
    const state = makeFortifyState();
    const config: FortifyConfig = { ...connectedFortify, maxFortifiesPerTurn: 1 };
    const first = applyAction(state, P1, fortify(T1, T2, 1), fortifyMap, undefined, config);
    expect(first.state.fortifiesUsedThisTurn).toBe(1);
    expect(() =>
      applyAction(first.state, P1, fortify(T2, T1, 1), fortifyMap, undefined, config),
    ).toThrow(/reached max fortifies per turn/);
  });

  test("allows multiple fortifies when cap permits", () => {
    const state = makeFortifyState();
    const config: FortifyConfig = { ...connectedFortify, maxFortifiesPerTurn: 2 };
    const first = applyAction(state, P1, fortify(T1, T2, 1), fortifyMap, undefined, config);
    const second = applyAction(first.state, P1, fortify(T2, T1, 1), fortifyMap, undefined, config);
    expect(second.state.fortifiesUsedThisTurn).toBe(2);
  });
});

// ── EndTurn tests ──────────────────────────────────────────────────

const endTurnMap: GraphMap = {
  territories: {
    [T1]: {},
    [T2]: {},
    [T3]: {},
    [T4]: {},
    [T5]: {},
    [T6]: {},
  },
  adjacency: {
    [T1]: [T2],
    [T2]: [T1, T3],
    [T3]: [T2, T4],
    [T4]: [T3, T5],
    [T5]: [T4, T6],
    [T6]: [T5],
  },
};

function endTurn(): EndTurn {
  return { type: "EndTurn" };
}

function makeEndTurnState(overrides?: Partial<GameState>): GameState {
  return makeState({
    players: { p1: { status: "alive" }, p2: { status: "alive" } },
    turnOrder: [P1, P2],
    turn: { currentPlayerId: P1, phase: "Fortify", round: 1 },
    reinforcements: undefined,
    territories: {
      [T1]: { ownerId: P1, armies: 5 },
      [T2]: { ownerId: P1, armies: 3 },
      [T3]: { ownerId: P1, armies: 2 },
      [T4]: { ownerId: P2, armies: 4 },
      [T5]: { ownerId: P2, armies: 3 },
      [T6]: { ownerId: P2, armies: 2 },
    },
    capturedThisTurn: true,
    ...overrides,
  });
}

describe("EndTurn", () => {
  test("advances turn to next player with Reinforcement phase", () => {
    const state = makeEndTurnState();
    const result = applyAction(state, P1, endTurn(), endTurnMap);

    expect(result.state.turn.currentPlayerId).toBe(P2);
    expect(result.state.turn.phase).toBe("Reinforcement");
    expect(result.state.turn.round).toBe(1); // same round
  });

  test("resets fortify usage counter on turn advance", () => {
    const state = makeEndTurnState({ fortifiesUsedThisTurn: 2 });
    const result = applyAction(state, P1, endTurn(), endTurnMap);
    expect(result.state.fortifiesUsedThisTurn).toBe(0);
  });

  test("clears capturedThisTurn flag", () => {
    const state = makeEndTurnState({ capturedThisTurn: true });
    const result = applyAction(state, P1, endTurn(), endTurnMap);

    expect(result.state.capturedThisTurn).toBe(false);
  });

  test("computes reinforcements for next player", () => {
    const state = makeEndTurnState();
    const result = applyAction(state, P1, endTurn(), endTurnMap);

    // P2 owns 3 territories → max(3, floor(3/3)) = 3
    expect(result.state.reinforcements).toBeDefined();
    expect(result.state.reinforcements!.remaining).toBe(3);
  });

  test("emits TurnEnded, TurnAdvanced, and ReinforcementsGranted events", () => {
    const state = makeEndTurnState();
    const result = applyAction(state, P1, endTurn(), endTurnMap);

    expect(result.events).toHaveLength(3);

    const turnEnded = result.events[0] as TurnEnded;
    expect(turnEnded.type).toBe("TurnEnded");
    expect(turnEnded.playerId).toBe(P1);

    const turnAdvanced = result.events[1] as TurnAdvanced;
    expect(turnAdvanced.type).toBe("TurnAdvanced");
    expect(turnAdvanced.nextPlayerId).toBe(P2);
    expect(turnAdvanced.round).toBe(1);

    const reinforcements = result.events[2] as ReinforcementsGranted;
    expect(reinforcements.type).toBe("ReinforcementsGranted");
    expect(reinforcements.playerId).toBe(P2);
    expect(reinforcements.amount).toBe(3);
  });

  test("increments round when wrapping back to first player", () => {
    const state = makeEndTurnState({
      turn: { currentPlayerId: P2, phase: "Fortify", round: 1 },
    });
    const result = applyAction(state, P2, endTurn(), endTurnMap);

    expect(result.state.turn.currentPlayerId).toBe(P1);
    expect(result.state.turn.round).toBe(2);

    // TurnAdvanced event reflects the new round
    const turnAdvanced = result.events[1] as TurnAdvanced;
    expect(turnAdvanced.round).toBe(2);
  });

  test("skips defeated players when advancing turn", () => {
    const state = makeEndTurnState({
      players: {
        p1: { status: "alive" },
        p2: { status: "defeated" },
        p3: { status: "alive" },
      },
      turnOrder: [P1, P2, P3],
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 3 },
        [T3]: { ownerId: P1, armies: 2 },
        [T4]: { ownerId: P1, armies: 4 },
        [T5]: { ownerId: P3, armies: 3 },
        [T6]: { ownerId: P3, armies: 2 },
      },
    });

    const result = applyAction(state, P1, endTurn(), endTurnMap);

    // Should skip P2 (defeated) and go to P3
    expect(result.state.turn.currentPlayerId).toBe(P3);
    expect(result.state.turn.round).toBe(1); // same round
  });

  test("increments round when wrapping past defeated players", () => {
    // P3's turn, P1 alive, P2 defeated → wraps to P1 with round increment
    const state = makeEndTurnState({
      players: {
        p1: { status: "alive" },
        p2: { status: "defeated" },
        p3: { status: "alive" },
      },
      turnOrder: [P1, P2, P3],
      turn: { currentPlayerId: P3, phase: "Fortify", round: 3 },
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 3 },
        [T3]: { ownerId: P1, armies: 2 },
        [T4]: { ownerId: P1, armies: 4 },
        [T5]: { ownerId: P3, armies: 3 },
        [T6]: { ownerId: P3, armies: 2 },
      },
    });

    const result = applyAction(state, P3, endTurn(), endTurnMap);

    expect(result.state.turn.currentPlayerId).toBe(P1);
    expect(result.state.turn.round).toBe(4);
  });

  test("increments stateVersion", () => {
    const state = makeEndTurnState();
    const result = applyAction(state, P1, endTurn(), endTurnMap);
    expect(result.state.stateVersion).toBe(1);
  });

  test("does not mutate original state", () => {
    const state = makeEndTurnState();
    applyAction(state, P1, endTurn(), endTurnMap);

    expect(state.turn.phase).toBe("Fortify");
    expect(state.turn.currentPlayerId).toBe(P1);
    expect(state.capturedThisTurn).toBe(true);
    expect(state.stateVersion).toBe(0);
  });

  // ── Validation errors ────────────────────────────────────────────

  test("rejects when not in Fortify phase", () => {
    const state = makeEndTurnState({
      turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
    });
    expect(() => applyAction(state, P1, endTurn(), endTurnMap)).toThrow(
      /current phase is Attack/,
    );
  });

  test("rejects when not current player", () => {
    const state = makeEndTurnState();
    expect(() => applyAction(state, P2, endTurn(), endTurnMap)).toThrow(
      /Not your turn/,
    );
  });

  test("throws when map is not provided", () => {
    const state = makeEndTurnState();
    expect(() => applyAction(state, P1, endTurn())).toThrow(
      /GraphMap is required/,
    );
  });

  // ── Full turn cycle e2e ──────────────────────────────────────────

  test("full turn cycle: Reinforcement → Attack → Fortify → EndTurn → next player Reinforcement", () => {
    // Start with P1 in Reinforcement phase
    const state = makeState({
      players: { p1: { status: "alive" }, p2: { status: "alive" } },
      turnOrder: [P1, P2],
      territories: {
        [T1]: { ownerId: P1, armies: 3 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 4 },
        [T4]: { ownerId: P2, armies: 3 },
        [T5]: { ownerId: P2, armies: 2 },
        [T6]: { ownerId: P2, armies: 1 },
      },
      reinforcements: { remaining: 3 },
    });

    // Place all reinforcements
    const r1 = applyAction(state, P1, place(T1, 3));
    expect(r1.state.turn.phase).toBe("Attack");

    // Skip attack
    const r2 = applyAction(r1.state, P1, endAttack());
    expect(r2.state.turn.phase).toBe("Fortify");

    // End turn (skip fortify)
    const r3 = applyAction(r2.state, P1, endTurn(), endTurnMap);
    expect(r3.state.turn.phase).toBe("Reinforcement");
    expect(r3.state.turn.currentPlayerId).toBe(P2);
    expect(r3.state.reinforcements).toBeDefined();
    expect(r3.state.reinforcements!.remaining).toBeGreaterThanOrEqual(3);
    expect(r3.state.capturedThisTurn).toBe(false);
  });
});

// ── Card draw on EndTurn tests ────────────────────────────────────────

describe("Card draw on EndTurn", () => {
  const C1 = "c1" as CardId;
  const C2 = "c2" as CardId;
  const C3 = "c3" as CardId;

  function makeCardEndTurnState(overrides?: Partial<GameState>): GameState {
    return makeState({
      players: { p1: { status: "alive" }, p2: { status: "alive" } },
      turnOrder: [P1, P2],
      turn: { currentPlayerId: P1, phase: "Fortify", round: 1 },
      reinforcements: undefined,
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 3 },
        [T3]: { ownerId: P1, armies: 2 },
        [T4]: { ownerId: P2, armies: 4 },
      },
      deck: { draw: [C1, C2, C3], discard: [] },
      cardsById: {
        c1: { kind: "A" },
        c2: { kind: "B" },
        c3: { kind: "C" },
      },
      hands: { p1: [], p2: [] },
      capturedThisTurn: true,
      ...overrides,
    });
  }

  test("draws a card when capturedThisTurn is true and cardsConfig provided", () => {
    const state = makeCardEndTurnState();
    const result = applyAction(
      state, P1, endTurn(), endTurnMap, undefined, undefined, defaultRuleset.cards,
    );

    // CardDrawn event should be first
    const cardDrawn = result.events.find((e) => e.type === "CardDrawn") as CardDrawn;
    expect(cardDrawn).toBeDefined();
    expect(cardDrawn.playerId).toBe(P1);
    expect(cardDrawn.cardId).toBe(C1); // first card in draw pile

    // Card added to player's hand
    expect(result.state.hands[P1 as string]).toContain(C1);
    expect(result.state.hands[P1 as string]).toHaveLength(1);

    // Deck draw pile reduced
    expect(result.state.deck.draw).toHaveLength(2);
    expect(result.state.deck.draw).not.toContain(C1);
  });

  test("does not draw when capturedThisTurn is false", () => {
    const state = makeCardEndTurnState({ capturedThisTurn: false });
    const result = applyAction(
      state, P1, endTurn(), endTurnMap, undefined, undefined, defaultRuleset.cards,
    );

    const cardDrawn = result.events.find((e) => e.type === "CardDrawn");
    expect(cardDrawn).toBeUndefined();
    expect(result.state.hands[P1 as string]).toHaveLength(0);
    expect(result.state.deck.draw).toHaveLength(3);
  });

  test("does not draw when cardsConfig is not provided", () => {
    const state = makeCardEndTurnState();
    const result = applyAction(state, P1, endTurn(), endTurnMap);

    const cardDrawn = result.events.find((e) => e.type === "CardDrawn");
    expect(cardDrawn).toBeUndefined();
    expect(result.state.hands[P1 as string]).toHaveLength(0);
  });

  test("does not draw when awardCardOnCapture is false", () => {
    const noAwardConfig: CardsConfig = {
      ...defaultRuleset.cards,
      awardCardOnCapture: false,
    };
    const state = makeCardEndTurnState();
    const result = applyAction(
      state, P1, endTurn(), endTurnMap, undefined, undefined, noAwardConfig,
    );

    const cardDrawn = result.events.find((e) => e.type === "CardDrawn");
    expect(cardDrawn).toBeUndefined();
  });

  test("does not draw when deck is empty (draw and discard)", () => {
    const state = makeCardEndTurnState({
      deck: { draw: [], discard: [] },
    });
    const result = applyAction(
      state, P1, endTurn(), endTurnMap, undefined, undefined, defaultRuleset.cards,
    );

    const cardDrawn = result.events.find((e) => e.type === "CardDrawn");
    expect(cardDrawn).toBeUndefined();
  });

  test("reshuffles discard into draw when draw pile is empty", () => {
    const state = makeCardEndTurnState({
      deck: { draw: [], discard: [C1, C2, C3] },
    });
    const result = applyAction(
      state, P1, endTurn(), endTurnMap, undefined, undefined, defaultRuleset.cards,
    );

    const cardDrawn = result.events.find((e) => e.type === "CardDrawn") as CardDrawn;
    expect(cardDrawn).toBeDefined();
    // Card came from the reshuffled discard
    expect([C1, C2, C3]).toContain(cardDrawn.cardId);
    // Discard should now be empty (reshuffled)
    expect(result.state.deck.discard).toHaveLength(0);
    // 2 remaining in draw after 1 drawn from 3 reshuffled
    expect(result.state.deck.draw).toHaveLength(2);
  });

  test("event order: CardDrawn before TurnEnded", () => {
    const state = makeCardEndTurnState();
    const result = applyAction(
      state, P1, endTurn(), endTurnMap, undefined, undefined, defaultRuleset.cards,
    );

    const types = result.events.map((e) => e.type);
    expect(types).toEqual([
      "CardDrawn",
      "TurnEnded",
      "TurnAdvanced",
      "ReinforcementsGranted",
    ]);
  });

  test("card count conserved across EndTurn with draw", () => {
    const state = makeCardEndTurnState();
    const totalBefore =
      state.deck.draw.length +
      state.deck.discard.length +
      Object.values(state.hands).reduce((sum, h) => sum + h.length, 0);

    const result = applyAction(
      state, P1, endTurn(), endTurnMap, undefined, undefined, defaultRuleset.cards,
    );

    const totalAfter =
      result.state.deck.draw.length +
      result.state.deck.discard.length +
      Object.values(result.state.hands).reduce((sum, h) => sum + (h as readonly CardId[]).length, 0);

    expect(totalAfter).toBe(totalBefore);
  });

  test("appends to existing hand", () => {
    const state = makeCardEndTurnState({
      hands: { p1: [C3], p2: [] },
      deck: { draw: [C1, C2], discard: [] },
    });
    const result = applyAction(
      state, P1, endTurn(), endTurnMap, undefined, undefined, defaultRuleset.cards,
    );

    expect(result.state.hands[P1 as string]).toEqual([C3, C1]);
  });

  test("clears capturedThisTurn after draw", () => {
    const state = makeCardEndTurnState();
    const result = applyAction(
      state, P1, endTurn(), endTurnMap, undefined, undefined, defaultRuleset.cards,
    );

    expect(result.state.capturedThisTurn).toBe(false);
  });
});

// ── Card transfer on elimination tests ────────────────────────────────

describe("Card transfer on elimination", () => {
  const C1 = "c1" as CardId;
  const C2 = "c2" as CardId;
  const C3 = "c3" as CardId;

  test("transfers cards from eliminated player to attacker", () => {
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 1 },
      },
      hands: {
        p1: [C1],
        p2: [C2, C3],
      },
    });

    for (let seed = 0; seed < 100; seed++) {
      const s = { ...state, rng: { seed, index: 0 } };
      const result = applyAction(s, P1, attack(T1, T3), testMap, defaultCombat);
      const attackEvent = result.events[0] as AttackResolved;

      if (attackEvent.defenderLosses === 1) {
        // P2 eliminated — cards transferred
        const elimEvent = result.events.find(
          (e) => e.type === "PlayerEliminated",
        ) as PlayerEliminated;
        expect(elimEvent.cardsTransferred).toEqual([C2, C3]);

        // P1 now has all cards
        expect(result.state.hands[P1 as string]).toEqual([C1, C2, C3]);
        // P2 hand is empty
        expect(result.state.hands[P2 as string]).toEqual([]);
        return;
      }
    }
    throw new Error("No capture occurred in 100 seeds");
  });

  test("no card transfer when defender is not eliminated", () => {
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 1 },
        [T4]: { ownerId: P2, armies: 3 },
      },
      hands: {
        p1: [],
        p2: [C1, C2],
      },
    });

    for (let seed = 0; seed < 100; seed++) {
      const s = { ...state, rng: { seed, index: 0 } };
      const result = applyAction(s, P1, attack(T1, T3), testMap, defaultCombat);
      const attackEvent = result.events[0] as AttackResolved;

      if (attackEvent.defenderLosses === 1) {
        // P2 not eliminated (has T4)
        const elimEvent = result.events.find(
          (e) => e.type === "PlayerEliminated",
        );
        expect(elimEvent).toBeUndefined();
        // Hands unchanged
        expect(result.state.hands[P1 as string]).toEqual([]);
        expect(result.state.hands[P2 as string]).toEqual([C1, C2]);
        return;
      }
    }
    throw new Error("No capture occurred in 100 seeds");
  });

  test("transfers empty hand on elimination (no cards)", () => {
    const state = makeAttackState({
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 1 },
      },
      hands: {
        p1: [C1],
        p2: [],
      },
    });

    for (let seed = 0; seed < 100; seed++) {
      const s = { ...state, rng: { seed, index: 0 } };
      const result = applyAction(s, P1, attack(T1, T3), testMap, defaultCombat);
      const attackEvent = result.events[0] as AttackResolved;

      if (attackEvent.defenderLosses === 1) {
        const elimEvent = result.events.find(
          (e) => e.type === "PlayerEliminated",
        ) as PlayerEliminated;
        expect(elimEvent.cardsTransferred).toEqual([]);
        expect(result.state.hands[P1 as string]).toEqual([C1]);
        expect(result.state.hands[P2 as string]).toEqual([]);
        return;
      }
    }
    throw new Error("No capture occurred in 100 seeds");
  });
});

// ── Team integration tests ──────────────────────────────────────────

import type { TeamId } from "./types.js";

const TEAM_A = "teamA" as TeamId;
const TEAM_B = "teamB" as TeamId;

const teamsFullAccess: TeamsConfig = {
  teamsEnabled: true,
  preventAttackingTeammates: true,
  allowPlaceOnTeammate: true,
  allowFortifyWithTeammate: true,
  allowFortifyThroughTeammates: true,
  winCondition: "lastTeamStanding",
  continentBonusRecipient: "majorityHolderOnTeam",
};

const teamsRestricted: TeamsConfig = {
  teamsEnabled: true,
  preventAttackingTeammates: true,
  allowPlaceOnTeammate: false,
  allowFortifyWithTeammate: false,
  allowFortifyThroughTeammates: false,
  winCondition: "lastTeamStanding",
  continentBonusRecipient: "majorityHolderOnTeam",
};

describe("Team: PlaceReinforcements", () => {
  test("allows placing on teammate territory when enabled", () => {
    const state = makeState({
      players: {
        p1: { status: "alive", teamId: TEAM_A },
        p2: { status: "alive", teamId: TEAM_A },
      },
      territories: {
        [T1]: { ownerId: P1, armies: 3 },
        [T2]: { ownerId: P2, armies: 2 },
        [T3]: { ownerId: P2, armies: 4 },
      },
    });

    // Place on P2's territory (teammate)
    const result = applyAction(state, P1, place(T2, 2), undefined, undefined, undefined, undefined, teamsFullAccess);
    expect(result.state.territories[T2].armies).toBe(4); // 2 + 2
  });

  test("rejects placing on teammate territory when disabled", () => {
    const state = makeState({
      players: {
        p1: { status: "alive", teamId: TEAM_A },
        p2: { status: "alive", teamId: TEAM_A },
      },
      territories: {
        [T1]: { ownerId: P1, armies: 3 },
        [T2]: { ownerId: P2, armies: 2 },
        [T3]: { ownerId: P2, armies: 4 },
      },
    });

    expect(() =>
      applyAction(state, P1, place(T2, 2), undefined, undefined, undefined, undefined, teamsRestricted),
    ).toThrow(/not owned by/);
  });

  test("rejects placing on enemy team territory", () => {
    const state = makeState({
      players: {
        p1: { status: "alive", teamId: TEAM_A },
        p2: { status: "alive", teamId: TEAM_B },
      },
      territories: {
        [T1]: { ownerId: P1, armies: 3 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 4 },
      },
    });

    expect(() =>
      applyAction(state, P1, place(T3, 2), undefined, undefined, undefined, undefined, teamsFullAccess),
    ).toThrow(/not owned by/);
  });
});

describe("Team: Attack", () => {
  test("prevents attacking teammate territory", () => {
    const state = makeAttackState({
      players: {
        p1: { status: "alive", teamId: TEAM_A },
        p2: { status: "alive", teamId: TEAM_A },
      },
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 4 },
      },
    });

    expect(() =>
      applyAction(state, P1, attack(T1, T3), testMap, defaultCombat, undefined, undefined, teamsFullAccess),
    ).toThrow(/Cannot attack teammate territory/);
  });

  test("allows attacking enemy team territory", () => {
    const state = makeAttackState({
      players: {
        p1: { status: "alive", teamId: TEAM_A },
        p2: { status: "alive", teamId: TEAM_B },
      },
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P2, armies: 4 },
      },
    });

    // Should not throw
    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat, undefined, undefined, teamsFullAccess);
    expect(result.events[0]!.type).toBe("AttackResolved");
  });

  test("allows attacking neutral with teams enabled", () => {
    const state = makeAttackState({
      players: {
        p1: { status: "alive", teamId: TEAM_A },
        p2: { status: "alive", teamId: TEAM_B },
      },
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: "neutral", armies: 1 },
      },
    });

    const result = applyAction(state, P1, attack(T1, T3), testMap, defaultCombat, undefined, undefined, teamsFullAccess);
    expect(result.events[0]!.type).toBe("AttackResolved");
  });
});

describe("Team: Fortify", () => {
  test("allows fortifying to teammate territory when enabled", () => {
    const state = makeFortifyState({
      players: {
        p1: { status: "alive", teamId: TEAM_A },
        p2: { status: "alive", teamId: TEAM_A },
      },
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P2, armies: 3 },
        [T3]: { ownerId: P1, armies: 2 },
        [T4]: { ownerId: P2, armies: 4 },
        [T5]: { ownerId: P1, armies: 1 },
        [T6]: { ownerId: P1, armies: 2 },
      },
    });

    // Fortify from P1's T1 to P2's T2 (teammate, adjacent)
    const result = applyAction(
      state, P1, fortify(T1, T2, 2), fortifyMap, undefined, connectedFortify, undefined, teamsFullAccess,
    );
    expect(result.state.territories[T1].armies).toBe(3);
    expect(result.state.territories[T2].armies).toBe(5);
  });

  test("rejects fortifying to teammate territory when disabled", () => {
    const state = makeFortifyState({
      players: {
        p1: { status: "alive", teamId: TEAM_A },
        p2: { status: "alive", teamId: TEAM_A },
      },
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P2, armies: 3 },
        [T3]: { ownerId: P1, armies: 2 },
        [T4]: { ownerId: P2, armies: 4 },
        [T5]: { ownerId: P1, armies: 1 },
        [T6]: { ownerId: P1, armies: 2 },
      },
    });

    expect(() =>
      applyAction(
        state, P1, fortify(T1, T2, 2), fortifyMap, undefined, connectedFortify, undefined, teamsRestricted,
      ),
    ).toThrow(/not owned by/);
  });

  test("allows traversing teammate territory in connected mode when enabled", () => {
    // T1(P1) — T2(P2 teammate) — T3(P1): should be able to fortify T1→T3 through T2
    const state = makeFortifyState({
      players: {
        p1: { status: "alive", teamId: TEAM_A },
        p2: { status: "alive", teamId: TEAM_A },
      },
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P2, armies: 3 },
        [T3]: { ownerId: P1, armies: 2 },
        [T4]: { ownerId: P2, armies: 4 },
        [T5]: { ownerId: P1, armies: 1 },
        [T6]: { ownerId: P1, armies: 2 },
      },
    });

    const result = applyAction(
      state, P1, fortify(T1, T3, 2), fortifyMap, undefined, connectedFortify, undefined, teamsFullAccess,
    );
    expect(result.state.territories[T1].armies).toBe(3);
    expect(result.state.territories[T3].armies).toBe(4);
  });

  test("rejects traversing teammate territory when disabled", () => {
    // T1(P1) — T2(P2 teammate) — T3(P1): cannot traverse through T2
    const state = makeFortifyState({
      players: {
        p1: { status: "alive", teamId: TEAM_A },
        p2: { status: "alive", teamId: TEAM_A },
      },
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P2, armies: 3 },
        [T3]: { ownerId: P1, armies: 2 },
        [T4]: { ownerId: P2, armies: 4 },
        [T5]: { ownerId: P1, armies: 1 },
        [T6]: { ownerId: P1, armies: 2 },
      },
    });

    expect(() =>
      applyAction(
        state, P1, fortify(T1, T3, 2), fortifyMap, undefined, connectedFortify, undefined, teamsRestricted,
      ),
    ).toThrow(/No connected path/);
  });
});
