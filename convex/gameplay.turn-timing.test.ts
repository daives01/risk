import { describe, expect, test } from "bun:test";
import type { GameState, PlayerId } from "risk-engine";
import { resolveTurnTimingPatch } from "./gameplay";

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;

function makeState(overrides?: Partial<GameState>): GameState {
  return {
    players: {
      [P1]: { status: "alive" },
      [P2]: { status: "alive" },
    },
    turnOrder: [P1, P2],
    territories: {},
    turn: { currentPlayerId: P1, phase: "Reinforcement", round: 1 },
    reinforcements: { remaining: 3, sources: { territory: 3 } },
    deck: { draw: [], discard: [] },
    cardsById: {},
    hands: { [P1]: [], [P2]: [] },
    tradesCompleted: 0,
    capturedThisTurn: false,
    fortifiesUsedThisTurn: 0,
    rng: { seed: "test", index: 0 },
    stateVersion: 1,
    rulesetVersion: 1,
    ...overrides,
  };
}

describe("resolveTurnTimingPatch", () => {
  test("preserves current async deadline when the turn does not advance", () => {
    const previousState = makeState();
    const nextState = makeState({
      turn: { currentPlayerId: P1, phase: "Attack", round: 1 },
      reinforcements: { remaining: 0, sources: { territory: 3 } },
      stateVersion: 2,
    });

    const patch = resolveTurnTimingPatch({
      timingMode: "async_1d",
      excludeWeekends: false,
      previousState,
      nextState,
      now: Date.UTC(2026, 2, 26, 12, 0, 0, 0),
      currentTurnStartedAt: 1000,
      currentTurnDeadlineAt: 2000,
    });

    expect(patch).toEqual({
      turnStartedAt: 1000,
      turnDeadlineAt: 2000,
      shouldNotify: false,
    });
  });
});
