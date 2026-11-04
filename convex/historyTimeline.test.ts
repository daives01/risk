import { describe, expect, test } from "bun:test";
import type { GameEvent, GameState, PlayerId, TerritoryId } from "risk-engine";
import {
  applyTimelineStatePatch,
  buildTimelineStatePatch,
  describeTimelineStep,
  summarizeTimelineFrame,
  type TimelinePublicState,
} from "./historyTimeline";

// SAFETY: These literal strings identify the players used by this complete timeline fixture.
const P1 = "p1" as PlayerId;
// SAFETY: This fixture's current-player ID is the same p2 key declared in players below.
const P2 = "p2" as PlayerId;
// SAFETY: This fixture declares p3 as the defeated player referenced by the elimination event.
const P3 = "p3" as PlayerId;
// SAFETY: The a and b strings are territory keys in this fixture, not unvalidated external IDs.
const A = "a" as TerritoryId;
// SAFETY: The b string is the source territory key declared in this fixture.
const B = "b" as TerritoryId;

const baseState: GameState = {
  players: { p1: { status: "alive" }, p2: { status: "alive" }, p3: { status: "defeated" } },
  turnOrder: [P1, P2],
  territories: { a: { ownerId: P1, armies: 1 }, b: { ownerId: P2, armies: 2 } },
  turn: { round: 3, currentPlayerId: P2, phase: "Attack" },
  deck: { draw: [], discard: [] },
  cardsById: {},
  hands: { p1: [], p2: [], p3: [] },
  tradesCompleted: 0,
  capturedThisTurn: true,
  rng: { seed: "timeline-fixture", index: 0 },
  stateVersion: 1,
  rulesetVersion: 1,
};

const capture: GameEvent = { type: "TerritoryCaptured", from: B, to: A, newOwnerId: P1 };
const elimination: GameEvent = {
  type: "PlayerEliminated", eliminatedId: P3, byId: P1, cardsTransferred: [],
};

describe("history timeline summaries", () => {
  test("describes known event types", () => {
    expect(describeTimelineStep({ type: "Attack" }, [capture])).toBe(
      "Territory captured",
    );
    expect(describeTimelineStep({ type: "PlaceReinforcementsBatch" }, [])).toBe("Placement batch confirmed");
  });

  test("extracts capture/elimination markers and labels", () => {
    const summary = summarizeTimelineFrame({
      action: { type: "Attack" },
      actionType: "Attack",
      actorId: "p1",
      events: [capture, elimination],
      state: baseState,
    });

    expect(summary.hasCapture).toBe(true);
    expect(summary.eliminatedPlayerIds).toEqual(["p3"]);
    expect(summary.turnRound).toBe(3);
    expect(String(summary.turnPlayerId)).toBe("p2");
    expect(summary.turnPhase).toBe("Attack");
    expect(summary.label).toContain("R3");
    expect(summary.label).toContain("p1");
    expect(summary.label).toContain("Attack");
  });
});

describe("history timeline compact states", () => {
  const previous: TimelinePublicState = {
    players: {
      p1: { status: "alive" },
      p2: { status: "alive" },
    },
    turnOrder: ["p1", "p2"],
    territories: {
      alaska: { ownerId: "p1", armies: 3 },
      alberta: { ownerId: "p2", armies: 2 },
    },
    turn: { round: 1, currentPlayerId: "p1", phase: "Attack" },
    pending: { type: "Occupy", from: "alaska", to: "alberta", minMove: 1, maxMove: 2 },
    reinforcements: { remaining: 0 },
    capturedThisTurn: false,
    tradesCompleted: 0,
    fortifiesUsedThisTurn: 1,
    deckCount: 40,
    discardCount: 2,
    handSizes: { p1: 3, p2: 4 },
    stateVersion: 7,
  };

  test("builds sparse patches and reconstructs the next public state", () => {
    const next = {
      ...previous,
      territories: {
        ...previous.territories,
        alberta: { ownerId: "p1", armies: 1 },
      },
      turn: { round: 1, currentPlayerId: "p1", phase: "Fortify" },
      capturedThisTurn: true,
      deckCount: 39,
      handSizes: { p1: 4, p2: 4 },
      stateVersion: 8,
    };
    delete next.pending;
    delete next.reinforcements;
    delete next.fortifiesUsedThisTurn;

    const patch = buildTimelineStatePatch(previous, next);

    expect(patch.territories).toEqual({
      alberta: { ownerId: "p1", armies: 1 },
    });
    expect(patch.pending).toBe(null);
    expect(patch.reinforcements).toBe(null);
    expect(patch.fortifiesUsedThisTurn).toBe(null);
    expect(applyTimelineStatePatch(previous, patch)).toEqual(next);
  });

});
