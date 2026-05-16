import { describe, expect, test } from "bun:test";
import type { GameEvent, GameState } from "risk-engine";
import {
  applyTimelineStatePatch,
  buildTimelineStatePatch,
  describeTimelineStep,
  shouldStoreTimelineCheckpoint,
  summarizeTimelineFrame,
  TIMELINE_CHECKPOINT_INTERVAL,
  type TimelinePublicState,
} from "./historyTimeline";

const baseState = {
  turn: {
    round: 3,
    currentPlayerId: "p2",
    phase: "Attack",
  },
} as GameState;

describe("history timeline summaries", () => {
  test("describes known event types", () => {
    expect(describeTimelineStep({ type: "Attack" }, [{ type: "TerritoryCaptured", to: "a" } as GameEvent])).toBe(
      "Territory captured",
    );
    expect(describeTimelineStep({ type: "PlaceReinforcementsBatch" }, [])).toBe("Placement batch confirmed");
  });

  test("extracts capture/elimination markers and labels", () => {
    const summary = summarizeTimelineFrame({
      action: { type: "Attack" },
      actionType: "Attack",
      actorId: "p1",
      events: [
        { type: "TerritoryCaptured", to: "a", newOwnerId: "p1" } as GameEvent,
        { type: "PlayerEliminated", eliminatedId: "p3", byId: "p1", cardsTransferred: [] } as unknown as GameEvent,
      ],
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

  test("marks the start frame and interval frames as checkpoints", () => {
    expect(shouldStoreTimelineCheckpoint(-1)).toBe(true);
    expect(shouldStoreTimelineCheckpoint(0)).toBe(true);
    expect(shouldStoreTimelineCheckpoint(TIMELINE_CHECKPOINT_INTERVAL - 1)).toBe(false);
    expect(shouldStoreTimelineCheckpoint(TIMELINE_CHECKPOINT_INTERVAL)).toBe(true);
  });
});
