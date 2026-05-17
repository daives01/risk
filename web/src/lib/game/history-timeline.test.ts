/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { mergeHistoryWindowActions, reconstructHistoryWindows } from "./history-timeline";
import type { PublicState } from "./types";

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
