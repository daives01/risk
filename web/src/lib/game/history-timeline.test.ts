/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { applyTimelineStatePatch, mergeHistoryWindowActions, reconstructHistoryWindows } from "./history-timeline";
import type { PublicState, TimelineStatePatch } from "./types";

const checkpoint: PublicState = {
  players: {
    p1: { status: "alive" },
    p2: { status: "alive" },
  },
  turnOrder: ["p1", "p2"],
  territories: {
    alaska: { ownerId: "p1", armies: 3 },
    alberta: { ownerId: "p2", armies: 2 },
  },
  turn: { currentPlayerId: "p1", phase: "Attack", round: 1 },
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

describe("replay patch omission semantics", () => {
  test("applies false, zero and empty collections without mutating prior state or patch", () => {
    const previous = { ...checkpoint, capturedThisTurn: true };
    const before = structuredClone(previous);
    const patch: TimelineStatePatch = {
      players: {}, turnOrder: [], turn: { currentPlayerId: "p2", phase: "Fortify", round: 0 },
      capturedThisTurn: false, tradesCompleted: 0, deckCount: 0, discardCount: 0,
      handSizes: {}, stateVersion: 0, territories: { alaska: { armies: 0 } }, fortifiesUsedThisTurn: 0,
    };
    const patchBefore = structuredClone(patch);
    const next = applyTimelineStatePatch(previous, patch);
    expect(next).toMatchObject({
      players: {}, turnOrder: [], turn: { currentPlayerId: "p2", phase: "Fortify", round: 0 },
      capturedThisTurn: false, tradesCompleted: 0, deckCount: 0, discardCount: 0,
      handSizes: {}, stateVersion: 0, fortifiesUsedThisTurn: 0,
    });
    expect(next.territories.alaska).toEqual({ ownerId: "p1", armies: 0 });
    expect(next.pending).toBe(previous.pending);
    expect(next.reinforcements).toBe(previous.reinforcements);
    expect(previous).toEqual(before);
    expect(patch).toEqual(patchBefore);
  });

  test("keeps omitted fields, deletes null fields and retains own undefined optionals", () => {
    const omitted = applyTimelineStatePatch(checkpoint, {});
    expect(omitted.pending).toBe(checkpoint.pending);
    expect(omitted.reinforcements).toBe(checkpoint.reinforcements);
    expect(omitted.fortifiesUsedThisTurn).toBe(1);
    const removed = applyTimelineStatePatch(checkpoint, {
      pending: null, reinforcements: null, fortifiesUsedThisTurn: null,
    });
    expect(Object.hasOwn(removed, "pending")).toBe(false);
    expect(Object.hasOwn(removed, "reinforcements")).toBe(false);
    expect(Object.hasOwn(removed, "fortifiesUsedThisTurn")).toBe(false);
    const explicit = applyTimelineStatePatch(checkpoint, {
      pending: undefined, reinforcements: undefined, fortifiesUsedThisTurn: undefined,
    });
    expect(Object.hasOwn(explicit, "pending")).toBe(true);
    expect(Object.hasOwn(explicit, "reinforcements")).toBe(true);
    expect(Object.hasOwn(explicit, "fortifiesUsedThisTurn")).toBe(true);
    expect(explicit.pending).toBeUndefined();
    expect(explicit.reinforcements).toBeUndefined();
    expect(explicit.fortifiesUsedThisTurn).toBeUndefined();
    const unchanged = applyTimelineStatePatch(removed, {});
    expect(Object.hasOwn(unchanged, "pending")).toBe(false);
    expect(Object.hasOwn(unchanged, "reinforcements")).toBe(false);
    expect(Object.hasOwn(unchanged, "fortifiesUsedThisTurn")).toBe(false);
  });
});

describe("history timeline reconstruction", () => {
  test("combines cached history windows in frame order", () => {
    const laterCheckpoint = {
      ...checkpoint,
      stateVersion: 9,
    };

    const frames = reconstructHistoryWindows([
      {
        latestIndex: 101,
        snapshotIndex: 100,
        snapshotPublicState: laterCheckpoint,
        actions: [{
          _id: "a101",
          index: 101,
          events: [{ type: "ReinforcementsPlaced", playerId: "p1", territoryId: "alaska", count: 1 }],
          publicStatePatch: {
            territories: { alaska: { armies: 4 } },
            stateVersion: 10,
          },
        }],
        hasPrevious: true,
      },
      {
        latestIndex: 99,
        snapshotIndex: -1,
        snapshotPublicState: checkpoint,
        actions: [{
          _id: "a99",
          index: 99,
          events: [{ type: "TurnAdvanced", nextPlayerId: "p2", round: 1 }],
          publicStatePatch: {
            turn: { currentPlayerId: "p2", phase: "Reinforcement", round: 1 },
            stateVersion: 8,
          },
        }],
        hasPrevious: false,
      },
    ]);

    expect(frames.map((frame) => frame.index)).toEqual([-1, 99, 101]);
    expect(frames.at(-1)?.state.stateVersion).toBe(10);
  });

  test("omits non-initial snapshot checkpoints from visible replay frames", () => {
    const frames = reconstructHistoryWindows([
      {
        latestIndex: 101,
        snapshotIndex: 100,
        snapshotPublicState: {
          ...checkpoint,
          stateVersion: 100,
        },
        actions: [{
          _id: "a101",
          index: 101,
          events: [{ type: "TurnAdvanced", nextPlayerId: "p2", round: 2 }],
          publicStatePatch: {
            turn: { currentPlayerId: "p2", phase: "Reinforcement", round: 2 },
            stateVersion: 101,
          },
        }],
        hasPrevious: true,
      },
    ]);

    expect(frames.map((frame) => frame.index)).toEqual([101]);
    expect(frames[0]?.state.stateVersion).toBe(101);
  });

  test("skips implementation-only actions while preserving later reconstructed state", () => {
    const frames = reconstructHistoryWindows([
      {
        latestIndex: 3,
        snapshotIndex: -1,
        snapshotPublicState: checkpoint,
        actions: [
          {
            _id: "phase-only",
            index: 1,
            events: [],
            publicStatePatch: {
              turn: { currentPlayerId: "p1", phase: "Fortify", round: 1 },
              stateVersion: 8,
            },
          },
          {
            _id: "fortify",
            index: 2,
            events: [{ type: "FortifyResolved", playerId: "p1", from: "alaska", to: "alaska", moved: 1 }],
            publicStatePatch: {
              territories: { alaska: { armies: 4 } },
              stateVersion: 9,
            },
          },
          {
            _id: "turn",
            index: 3,
            events: [{ type: "TurnAdvanced", nextPlayerId: "p2", round: 1 }],
            publicStatePatch: {
              turn: { currentPlayerId: "p2", phase: "Reinforcement", round: 1 },
              stateVersion: 10,
            },
          },
        ],
        hasPrevious: false,
      },
    ]);

    expect(frames.map((frame) => frame.index)).toEqual([-1, 2, 3]);
    expect(frames[1]?.state.turn.phase).toBe("Fortify");
    expect(frames[1]?.state.territories.alaska?.armies).toBe(4);
  });

  test("dedupes merged window actions by index", () => {
    const actions = mergeHistoryWindowActions([
      {
        latestIndex: 1,
        snapshotIndex: -1,
        snapshotPublicState: checkpoint,
        actions: [{
          _id: "older",
          index: 1,
          events: [{ type: "TurnAdvanced", nextPlayerId: "p2", round: 1 }],
        }],
        hasPrevious: false,
      },
      {
        latestIndex: 1,
        snapshotIndex: -1,
        snapshotPublicState: checkpoint,
        actions: [{
          _id: "newer",
          index: 1,
          events: [{ type: "TurnAdvanced", nextPlayerId: "p2", round: 1 }],
        }],
        hasPrevious: false,
      },
    ]);

    expect(actions).toEqual([{
      _id: "newer",
      index: 1,
      events: [{ type: "TurnAdvanced", nextPlayerId: "p2", round: 1 }],
    }]);
  });

  test("omits eventless phase-only actions from merged replay actions", () => {
    const actions = mergeHistoryWindowActions([
      {
        latestIndex: 1,
        snapshotIndex: -1,
        snapshotPublicState: checkpoint,
        actions: [{
          _id: "phase-only",
          index: 1,
          events: [],
          publicStatePatch: {
            turn: { currentPlayerId: "p1", phase: "Fortify", round: 1 },
            stateVersion: 8,
          },
        }],
        hasPrevious: false,
      },
    ]);

    expect(actions).toEqual([]);
  });
});
