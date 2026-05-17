/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  REPLAY_WINDOW_SIZE,
  resolveEarliestLoadedReplayWindowBoundary,
  resolveReplayWindowBeforeIndex,
  trimReplayWindowCache,
} from "./replay-window-policy";
import type { HistoryWindow } from "./types";

function windowAt(snapshotIndex: number): HistoryWindow {
  return {
    latestIndex: 999,
    snapshotIndex,
    snapshotPublicState: null,
    actions: [],
    hasPrevious: snapshotIndex > -1,
  };
}

function loadedWindowAt(snapshotIndex: number): HistoryWindow {
  return {
    ...windowAt(snapshotIndex),
    snapshotPublicState: {
      players: {},
      territories: {},
      turnOrder: [],
      turn: { round: 1, currentPlayerId: "p1", phase: "Attack" },
      capturedThisTurn: false,
      tradesCompleted: 0,
      deckCount: 0,
      discardCount: 0,
      handSizes: {},
      stateVersion: 1,
    },
  };
}

describe("replay window policy", () => {
  test("resolves bounded backend windows around frame positions", () => {
    expect(resolveReplayWindowBeforeIndex({ framePosition: 0, latestActionIndex: 350 })).toBe(0);
    expect(resolveReplayWindowBeforeIndex({ framePosition: 1, latestActionIndex: 350 })).toBe(REPLAY_WINDOW_SIZE);
    expect(resolveReplayWindowBeforeIndex({ framePosition: 135, latestActionIndex: 350 })).toBe(200);
    expect(resolveReplayWindowBeforeIndex({ framePosition: 900, latestActionIndex: 350 })).toBe(351);
  });

  test("keeps the most recently loaded replay windows in memory", () => {
    const cache = trimReplayWindowCache({
      first: windowAt(0),
      second: windowAt(100),
      third: windowAt(200),
      fourth: windowAt(300),
      fifth: windowAt(400),
    });

    expect(Object.keys(cache)).toEqual(["second", "third", "fourth", "fifth"]);
  });

  test("uses raw loaded window boundaries instead of visible frame indexes for older paging", () => {
    expect(resolveEarliestLoadedReplayWindowBoundary([
      loadedWindowAt(200),
      loadedWindowAt(300),
    ])).toBe(200);
  });

  test("ignores windows that have not loaded their snapshot state yet", () => {
    expect(resolveEarliestLoadedReplayWindowBoundary([
      windowAt(100),
      loadedWindowAt(200),
    ])).toBe(200);
  });
});
