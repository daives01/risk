import { expect, test } from "bun:test";
import {
  ENGINE_VERSION,
  type PlayerId,
  type TerritoryId,
  type ContinentId,
  type CardId,
  type TeamId,
  type Phase,
  type PlayerStatus,
  type Action,
  type GameEvent,
  type GameState,
  type RngState,
  type TurnState,
} from "risk-engine";

test("workspace import resolves", () => {
  expect(ENGINE_VERSION).toBe("0.0.1");
});

test("branded IDs are assignable from string casts", () => {
  const p = "p1" as PlayerId;
  const t = "t1" as TerritoryId;
  const c = "c1" as ContinentId;
  const card = "card1" as CardId;
  const team = "team1" as TeamId;

  // They are still strings at runtime
  expect(typeof p).toBe("string");
  expect(typeof t).toBe("string");
  expect(typeof c).toBe("string");
  expect(typeof card).toBe("string");
  expect(typeof team).toBe("string");
});

test("Action union discriminates on type field", () => {
  const action: Action = { type: "EndAttackPhase" };
  expect(action.type).toBe("EndAttackPhase");

  const attack: Action = {
    type: "Attack",
    from: "t1" as TerritoryId,
    to: "t2" as TerritoryId,
    attackerDice: 3,
  };
  expect(attack.type).toBe("Attack");
});

test("GameEvent union discriminates on type field", () => {
  const event: GameEvent = {
    type: "TurnEnded",
    playerId: "p1" as PlayerId,
  };
  expect(event.type).toBe("TurnEnded");

  const ended: GameEvent = {
    type: "GameEnded",
    winningPlayerId: "p1" as PlayerId,
  };
  expect(ended.type).toBe("GameEnded");
});

test("GameState is JSON-serializable", () => {
  const state: GameState = {
    players: {
      p1: { status: "alive" },
      p2: { status: "alive" },
    },
    turnOrder: ["p1" as PlayerId, "p2" as PlayerId],
    territories: {
      t1: { ownerId: "p1" as PlayerId, armies: 3 },
      t2: { ownerId: "neutral", armies: 1 },
    },
    turn: {
      currentPlayerId: "p1" as PlayerId,
      phase: "Reinforcement",
      round: 1,
    },
    deck: { draw: [], discard: [] },
    cardsById: {},
    hands: {},
    tradesCompleted: 0,
    capturedThisTurn: false,
    rng: { seed: "test-seed", index: 0 },
    stateVersion: 0,
    rulesetVersion: 1,
  };

  const json = JSON.stringify(state);
  const parsed = JSON.parse(json);

  expect(parsed.turn.phase).toBe("Reinforcement");
  expect(parsed.territories.t2.ownerId).toBe("neutral");
  expect(parsed.stateVersion).toBe(0);
});

test("all Phase values are valid string literals", () => {
  const phases: Phase[] = [
    "Setup",
    "Reinforcement",
    "Attack",
    "Occupy",
    "Fortify",
    "GameOver",
  ];
  expect(phases).toHaveLength(6);
});

test("all PlayerStatus values are valid string literals", () => {
  const statuses: PlayerStatus[] = ["alive", "defeated"];
  expect(statuses).toHaveLength(2);
});

test("all Action type tags are present", () => {
  const actionTypes: Action["type"][] = [
    "TradeCards",
    "PlaceReinforcements",
    "Attack",
    "Occupy",
    "Fortify",
    "EndAttackPhase",
    "EndTurn",
  ];
  expect(actionTypes).toHaveLength(7);
});

test("all GameEvent type tags are present", () => {
  const eventTypes: GameEvent["type"][] = [
    "SetupCompleted",
    "ReinforcementsGranted",
    "CardsTraded",
    "ReinforcementsPlaced",
    "AttackResolved",
    "TerritoryCaptured",
    "PlayerEliminated",
    "OccupyResolved",
    "FortifyResolved",
    "CardDrawn",
    "TurnEnded",
    "TurnAdvanced",
    "GameEnded",
  ];
  expect(eventTypes).toHaveLength(13);
});
