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
          events: [],
          publicStatePatch: { stateVersion: 10 },
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
          events: [],
          publicStatePatch: { stateVersion: 8 },
        }],
        hasPrevious: false,
      },
    ]);

    expect(frames.map((frame) => frame.index)).toEqual([-1, 99, 100, 101]);
    expect(frames.at(-1)?.state.stateVersion).toBe(10);
  });

  test("dedupes merged window actions by index", () => {
    const actions = mergeHistoryWindowActions([
      {
        latestIndex: 1,
        snapshotIndex: -1,
        snapshotPublicState: checkpoint,
        actions: [{ _id: "older", index: 1, events: [] }],
        hasPrevious: false,
      },
      {
        latestIndex: 1,
        snapshotIndex: -1,
        snapshotPublicState: checkpoint,
        actions: [{ _id: "newer", index: 1, events: [] }],
        hasPrevious: false,
      },
    ]);

    expect(actions).toEqual([{ _id: "newer", index: 1, events: [] }]);
  });
});
