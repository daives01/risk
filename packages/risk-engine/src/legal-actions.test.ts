import { describe, expect, test } from "bun:test";
import { getLegalActions } from "./legal-actions.js";
import type { LegalActionsConfig } from "./legal-actions.js";
import type {
  Action,
  CardId,
  GameState,
  PlayerId,
  TerritoryId,
  TeamId,
} from "./types.js";
import type { GraphMap } from "./map.js";
import type { CombatConfig, FortifyConfig, CardsConfig, TeamsConfig } from "./config.js";
import { defaultRuleset } from "./config.js";
import { applyAction, ActionError } from "./engine.js";

// ── Helpers ────────────────────────────────────────────────────────────

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;
const P3 = "p3" as PlayerId;
const T1 = "t1" as TerritoryId;
const T2 = "t2" as TerritoryId;
const T3 = "t3" as TerritoryId;
const T4 = "t4" as TerritoryId;
const T5 = "t5" as TerritoryId;

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
    [T3]: [T1, T2, T4],
    [T4]: [T3],
  },
};

const defaultCombat: CombatConfig = defaultRuleset.combat;
const defaultFortify: FortifyConfig = defaultRuleset.fortify;
const defaultCards: CardsConfig = defaultRuleset.cards;

function makeConfig(overrides?: Partial<LegalActionsConfig>): LegalActionsConfig {
  return {
    map: testMap,
    combat: defaultCombat,
    fortify: defaultFortify,
    cards: defaultCards,
    ...overrides,
  };
}

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    players: { p1: { status: "alive" }, p2: { status: "alive" } },
    turnOrder: [P1, P2],
    territories: {
      [T1]: { ownerId: P1, armies: 3 },
      [T2]: { ownerId: P1, armies: 2 },
      [T3]: { ownerId: P2, armies: 4 },
      [T4]: { ownerId: P2, armies: 1 },
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

function actionTypes(actions: readonly Action[]): string[] {
  return actions.map((a) => a.type);
}

// ── GameOver / Setup ─────────────────────────────────────────────────

describe("getLegalActions - GameOver", () => {
  test("returns empty array for GameOver", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "GameOver", round: 1 },
    });
    const actions = getLegalActions(state, makeConfig());
    expect(actions).toEqual([]);
  });
});

describe("getLegalActions - Setup", () => {
  test("returns empty array for Setup", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Setup", round: 1 },
    });
    const actions = getLegalActions(state, makeConfig());
    expect(actions).toEqual([]);
  });
});

// ── Reinforcement phase ─────────────────────────────────────────────

describe("getLegalActions - Reinforcement", () => {
  test("returns PlaceReinforcements for each owned territory", () => {
    const state = makeState();
    const actions = getLegalActions(state, makeConfig());
    const placeActions = actions.filter((a) => a.type === "PlaceReinforcements");
    expect(placeActions).toHaveLength(2); // T1 and T2 owned by P1
    const territories = placeActions.map((a) => (a as any).territoryId);
    expect(territories).toContain(T1);
    expect(territories).toContain(T2);
  });

  test("PlaceReinforcements count equals remaining", () => {
    const state = makeState({ reinforcements: { remaining: 3 } });
    const actions = getLegalActions(state, makeConfig());
    const placeActions = actions.filter((a) => a.type === "PlaceReinforcements");
    for (const a of placeActions) {
      expect((a as any).count).toBe(3);
    }
  });

  test("no PlaceReinforcements when remaining is 0", () => {
    const state = makeState({ reinforcements: { remaining: 0 } });
    const actions = getLegalActions(state, makeConfig());
    const placeActions = actions.filter((a) => a.type === "PlaceReinforcements");
    expect(placeActions).toHaveLength(0);
  });

  test("no TradeCards when player has no cards", () => {
    const state = makeState();
    const actions = getLegalActions(state, makeConfig());
    const tradeActions = actions.filter((a) => a.type === "TradeCards");
    expect(tradeActions).toHaveLength(0);
  });

  test("returns TradeCards for valid 3-card sets", () => {
    const C1 = "c1" as CardId;
    const C2 = "c2" as CardId;
    const C3 = "c3" as CardId;
    const state = makeState({
      hands: { [P1]: [C1, C2, C3] },
      cardsById: {
        [C1]: { kind: "A" },
        [C2]: { kind: "B" },
        [C3]: { kind: "C" },
      },
    });
    const actions = getLegalActions(state, makeConfig());
    const tradeActions = actions.filter((a) => a.type === "TradeCards");
    expect(tradeActions).toHaveLength(1);
    expect((tradeActions[0] as any).cardIds).toEqual([C1, C2, C3]);
  });

  test("forced trade: only TradeCards returned when hand >= forcedTradeHandSize", () => {
    const C1 = "c1" as CardId;
    const C2 = "c2" as CardId;
    const C3 = "c3" as CardId;
    const C4 = "c4" as CardId;
    const C5 = "c5" as CardId;
    const state = makeState({
      hands: { [P1]: [C1, C2, C3, C4, C5] },
      cardsById: {
        [C1]: { kind: "A" },
        [C2]: { kind: "B" },
        [C3]: { kind: "C" },
        [C4]: { kind: "A" },
        [C5]: { kind: "B" },
      },
    });
    const actions = getLegalActions(state, makeConfig());
    // Should not have any PlaceReinforcements
    const placeActions = actions.filter((a) => a.type === "PlaceReinforcements");
    expect(placeActions).toHaveLength(0);
    // Should have TradeCards
    const tradeActions = actions.filter((a) => a.type === "TradeCards");
    expect(tradeActions.length).toBeGreaterThan(0);
  });

  test("returns multiple TradeCards when multiple valid sets exist", () => {
    const C1 = "c1" as CardId;
    const C2 = "c2" as CardId;
    const C3 = "c3" as CardId;
    const C4 = "c4" as CardId;
    const state = makeState({
      hands: { [P1]: [C1, C2, C3, C4] },
      cardsById: {
        [C1]: { kind: "A" },
        [C2]: { kind: "A" },
        [C3]: { kind: "A" },
        [C4]: { kind: "A" },
      },
    });
    const actions = getLegalActions(state, makeConfig());
    const tradeActions = actions.filter((a) => a.type === "TradeCards");
    // C(4,3) = 4 combinations, all three-of-a-kind
    expect(tradeActions).toHaveLength(4);
  });

  test("wild cards form valid sets", () => {
    const C1 = "c1" as CardId;
    const C2 = "c2" as CardId;
    const C3 = "c3" as CardId;
    const state = makeState({
      hands: { [P1]: [C1, C2, C3] },
      cardsById: {
        [C1]: { kind: "A" },
        [C2]: { kind: "A" },
        [C3]: { kind: "W" },
      },
    });
    const actions = getLegalActions(state, makeConfig());
    const tradeActions = actions.filter((a) => a.type === "TradeCards");
    expect(tradeActions).toHaveLength(1); // A, A, W => three-of-a-kind with wild
  });
});

// ── Attack phase ────────────────────────────────────────────────────

describe("getLegalActions - Attack", () => {
  test("returns EndAttackPhase and Attack actions", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
      reinforcements: undefined,
    });
    const actions = getLegalActions(state, makeConfig());
    expect(actionTypes(actions)).toContain("EndAttackPhase");
    expect(actionTypes(actions)).toContain("Attack");
  });

  test("Attack actions for each from/to pair with dice choices", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
      reinforcements: undefined,
    });
    const config = makeConfig();
    const actions = getLegalActions(state, config);
    const attackActions = actions.filter((a) => a.type === "Attack");

    // T1 (3 armies) -> T3 (adjacent, enemy): dice 1,2
    // T2 (2 armies) -> T3 (adjacent, enemy): dice 1
    // T1 -> T2 not valid (same owner)
    // T3, T4 not owned by P1
    const fromT1 = attackActions.filter((a) => (a as any).from === T1);
    const fromT2 = attackActions.filter((a) => (a as any).from === T2);
    expect(fromT1).toHaveLength(2); // 1 and 2 dice choices for T1->T3
    expect(fromT2).toHaveLength(1); // 1 dice choice for T2->T3
  });

  test("no dice choice variants when allowAttackerDiceChoice is false", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
      reinforcements: undefined,
    });
    const config = makeConfig({
      combat: { ...defaultCombat, allowAttackerDiceChoice: false },
    });
    const actions = getLegalActions(state, config);
    const attackActions = actions.filter((a) => a.type === "Attack");
    // T1->T3 and T2->T3 — one each, no dice choice
    expect(attackActions).toHaveLength(2);
    for (const a of attackActions) {
      expect((a as any).attackerDice).toBeUndefined();
    }
  });

  test("territory with only 1 army cannot attack", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
      reinforcements: undefined,
      territories: {
        [T1]: { ownerId: P1, armies: 1 },
        [T2]: { ownerId: P2, armies: 1 },
      },
    });
    const config = makeConfig();
    const actions = getLegalActions(state, config);
    const attackActions = actions.filter((a) => a.type === "Attack");
    expect(attackActions).toHaveLength(0);
  });

  test("returns empty when pending occupy exists", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
      reinforcements: undefined,
      pending: { type: "Occupy", from: T1, to: T3, minMove: 1, maxMove: 2 },
    });
    const actions = getLegalActions(state, makeConfig());
    expect(actions).toHaveLength(0);
  });

  test("cannot attack own territory", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
      reinforcements: undefined,
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 3 },
      },
    });
    const config = makeConfig();
    const actions = getLegalActions(state, config);
    const attackActions = actions.filter((a) => a.type === "Attack");
    expect(attackActions).toHaveLength(0);
  });
});

// ── Occupy phase ────────────────────────────────────────────────────

describe("getLegalActions - Occupy", () => {
  test("returns Occupy actions for valid moveArmies range", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Occupy", round: 1 },
      reinforcements: undefined,
      pending: { type: "Occupy", from: T1, to: T3, minMove: 2, maxMove: 4 },
    });
    const actions = getLegalActions(state, makeConfig());
    expect(actions).toHaveLength(3);
    expect(actions).toEqual([
      { type: "Occupy", moveArmies: 2 },
      { type: "Occupy", moveArmies: 3 },
      { type: "Occupy", moveArmies: 4 },
    ]);
  });

  test("single Occupy when min equals max", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Occupy", round: 1 },
      reinforcements: undefined,
      pending: { type: "Occupy", from: T1, to: T3, minMove: 1, maxMove: 1 },
    });
    const actions = getLegalActions(state, makeConfig());
    expect(actions).toEqual([{ type: "Occupy", moveArmies: 1 }]);
  });

  test("returns empty when no pending", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Occupy", round: 1 },
      reinforcements: undefined,
    });
    const actions = getLegalActions(state, makeConfig());
    expect(actions).toHaveLength(0);
  });
});

// ── Fortify phase ───────────────────────────────────────────────────

describe("getLegalActions - Fortify", () => {
  test("always includes EndTurn", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Fortify", round: 1 },
      reinforcements: undefined,
    });
    const actions = getLegalActions(state, makeConfig());
    expect(actionTypes(actions)).toContain("EndTurn");
  });

  test("returns only EndTurn when fortify cap is reached", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Fortify", round: 1 },
      reinforcements: undefined,
      fortifiesUsedThisTurn: 1,
    });
    const actions = getLegalActions(state, makeConfig({
      fortify: { ...defaultFortify, maxFortifiesPerTurn: 1 },
    }));
    expect(actions).toEqual([{ type: "EndTurn" }]);
  });

  test("returns Fortify actions for valid from/to pairs", () => {
    // P1 owns T1(3) and T2(2), connected via adjacency
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Fortify", round: 1 },
      reinforcements: undefined,
    });
    const actions = getLegalActions(state, makeConfig());
    const fortifyActions = actions.filter((a) => a.type === "Fortify");

    // T1->T2 (max=2), T2->T1 (max=1)
    // T1 and T2 are connected (adjacent and both owned by P1)
    expect(fortifyActions).toHaveLength(2);

    const t1ToT2 = fortifyActions.find((a) => (a as any).from === T1 && (a as any).to === T2);
    const t2ToT1 = fortifyActions.find((a) => (a as any).from === T2 && (a as any).to === T1);
    expect(t1ToT2).toBeDefined();
    expect((t1ToT2 as any).count).toBe(2); // 3 - 1
    expect(t2ToT1).toBeDefined();
    expect((t2ToT1 as any).count).toBe(1); // 2 - 1
  });

  test("territory with 1 army cannot fortify from", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Fortify", round: 1 },
      reinforcements: undefined,
      territories: {
        [T1]: { ownerId: P1, armies: 1 },
        [T2]: { ownerId: P1, armies: 1 },
        [T3]: { ownerId: P2, armies: 4 },
        [T4]: { ownerId: P2, armies: 1 },
      },
    });
    const actions = getLegalActions(state, makeConfig());
    const fortifyActions = actions.filter((a) => a.type === "Fortify");
    expect(fortifyActions).toHaveLength(0);
  });

  test("adjacent mode limits fortify to neighbors", () => {
    // In this map: T1 adj to T2,T3 / T4 adj to T3 only
    // P1 owns T1 and T4, not adjacent to each other
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Fortify", round: 1 },
      reinforcements: undefined,
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P2, armies: 2 },
        [T3]: { ownerId: P2, armies: 3 },
        [T4]: { ownerId: P1, armies: 3 },
      },
    });
    const config = makeConfig({
      fortify: { ...defaultFortify, fortifyMode: "adjacent" },
    });
    const actions = getLegalActions(state, config);
    const fortifyActions = actions.filter((a) => a.type === "Fortify");
    // T1 not adjacent to T4, and T4 not adjacent to T1
    // So no fortify possible
    expect(fortifyActions).toHaveLength(0);
  });

  test("connected mode allows fortify through owned chain", () => {
    // T1 -> T3 -> T4, all owned by P1
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Fortify", round: 1 },
      reinforcements: undefined,
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P2, armies: 2 },
        [T3]: { ownerId: P1, armies: 3 },
        [T4]: { ownerId: P1, armies: 2 },
      },
    });
    const actions = getLegalActions(state, makeConfig());
    const fortifyActions = actions.filter((a) => a.type === "Fortify");
    // T1->T3, T1->T4, T3->T1, T3->T4, T4->T3, T4->T1
    const fromTo = fortifyActions.map((a) => `${(a as any).from}->${(a as any).to}`);
    expect(fromTo).toContain(`${T1}->${T3}`);
    expect(fromTo).toContain(`${T1}->${T4}`);
    expect(fromTo).toContain(`${T3}->${T1}`);
    expect(fromTo).toContain(`${T3}->${T4}`);
    expect(fromTo).toContain(`${T4}->${T3}`);
    expect(fromTo).toContain(`${T4}->${T1}`);
    expect(fortifyActions).toHaveLength(6);
  });

  test("cannot fortify through enemy territory in connected mode", () => {
    // T1 owned by P1, T3 owned by P2, T4 owned by P1
    // T1 is not connected to T4 through P1 territories (T3 blocks)
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Fortify", round: 1 },
      reinforcements: undefined,
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 3 },
        [T3]: { ownerId: P2, armies: 3 },
        [T4]: { ownerId: P1, armies: 2 },
      },
    });
    const actions = getLegalActions(state, makeConfig());
    const fortifyActions = actions.filter((a) => a.type === "Fortify");
    // T1<->T2 connected (adjacent, both P1). T4 isolated from T1/T2.
    const fromTo = fortifyActions.map((a) => `${(a as any).from}->${(a as any).to}`);
    expect(fromTo).toContain(`${T1}->${T2}`);
    expect(fromTo).toContain(`${T2}->${T1}`);
    expect(fromTo).not.toContain(`${T1}->${T4}`);
    expect(fromTo).not.toContain(`${T4}->${T1}`);
  });
});

// ── Every legal action succeeds when applied ────────────────────────

describe("getLegalActions correctness", () => {
  test("every Reinforcement legal action can be applied", () => {
    const C1 = "c1" as CardId;
    const C2 = "c2" as CardId;
    const C3 = "c3" as CardId;
    const state = makeState({
      hands: { [P1]: [C1, C2, C3] },
      cardsById: {
        [C1]: { kind: "A" },
        [C2]: { kind: "B" },
        [C3]: { kind: "C" },
      },
    });
    const config = makeConfig();
    const actions = getLegalActions(state, config);
    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      expect(() => {
        applyAction(
          state, P1, action,
          config.map, config.combat, config.fortify,
          config.cards, config.teams,
        );
      }).not.toThrow();
    }
  });

  test("every Attack legal action can be applied", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
      reinforcements: undefined,
    });
    const config = makeConfig();
    const actions = getLegalActions(state, config);
    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      expect(() => {
        applyAction(
          state, P1, action,
          config.map, config.combat, config.fortify,
          config.cards, config.teams,
        );
      }).not.toThrow();
    }
  });

  test("every Occupy legal action can be applied", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Occupy", round: 1 },
      reinforcements: undefined,
      pending: { type: "Occupy", from: T1, to: T3, minMove: 1, maxMove: 3 },
      territories: {
        [T1]: { ownerId: P1, armies: 5 },
        [T2]: { ownerId: P1, armies: 2 },
        [T3]: { ownerId: P1, armies: 0 },
        [T4]: { ownerId: P2, armies: 1 },
      },
    });
    const config = makeConfig();
    const actions = getLegalActions(state, config);
    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      expect(() => {
        applyAction(
          state, P1, action,
          config.map, config.combat, config.fortify,
          config.cards, config.teams,
        );
      }).not.toThrow();
    }
  });

  test("every Fortify legal action can be applied", () => {
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Fortify", round: 1 },
      reinforcements: undefined,
    });
    const config = makeConfig();
    const actions = getLegalActions(state, config);
    expect(actions.length).toBeGreaterThan(0);

    for (const action of actions) {
      expect(() => {
        applyAction(
          state, P1, action,
          config.map, config.combat, config.fortify,
          config.cards, config.teams,
        );
      }).not.toThrow();
    }
  });

  test("actions NOT in legal actions fail validation", () => {
    const state = makeState(); // Reinforcement phase

    // Attack should fail in Reinforcement phase
    const illegalAction: Action = { type: "Attack", from: T1, to: T3 };
    expect(() => {
      const config = makeConfig();
      applyAction(state, P1, illegalAction, config.map, config.combat);
    }).toThrow(ActionError);

    // EndTurn should fail in Reinforcement phase
    const endTurn: Action = { type: "EndTurn" };
    expect(() => {
      const config = makeConfig();
      applyAction(state, P1, endTurn, config.map);
    }).toThrow(ActionError);
  });
});

// ── Teams support ───────────────────────────────────────────────────

describe("getLegalActions - Teams", () => {
  const TEAM1 = "team1" as TeamId;

  test("team placement on teammate territory", () => {
    const teamsConfig: TeamsConfig = {
      teamsEnabled: true,
      preventAttackingTeammates: true,
      allowPlaceOnTeammate: true,
      allowFortifyWithTeammate: true,
      allowFortifyThroughTeammates: true,
      winCondition: "lastTeamStanding",
      continentBonusRecipient: "majorityHolderOnTeam",
    };
    const state = makeState({
      players: {
        p1: { status: "alive", teamId: TEAM1 },
        p2: { status: "alive", teamId: TEAM1 },
      },
    });
    const config = makeConfig({ teams: teamsConfig });
    const actions = getLegalActions(state, config);
    const placeActions = actions.filter((a) => a.type === "PlaceReinforcements");
    // P1 can place on T1, T2 (own) and T3, T4 (teammate P2)
    const territories = placeActions.map((a) => (a as any).territoryId);
    expect(territories).toContain(T1);
    expect(territories).toContain(T2);
    expect(territories).toContain(T3);
    expect(territories).toContain(T4);
  });

  test("cannot attack teammate when preventAttackingTeammates", () => {
    const teamsConfig: TeamsConfig = {
      teamsEnabled: true,
      preventAttackingTeammates: true,
      allowPlaceOnTeammate: false,
      allowFortifyWithTeammate: false,
      allowFortifyThroughTeammates: false,
      winCondition: "lastTeamStanding",
      continentBonusRecipient: "majorityHolderOnTeam",
    };
    const state = makeState({
      turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
      reinforcements: undefined,
      players: {
        p1: { status: "alive", teamId: TEAM1 },
        p2: { status: "alive", teamId: TEAM1 },
      },
    });
    const config = makeConfig({ teams: teamsConfig });
    const actions = getLegalActions(state, config);
    const attackActions = actions.filter((a) => a.type === "Attack");
    // P2 is teammate, so no attack targets
    expect(attackActions).toHaveLength(0);
  });
});
