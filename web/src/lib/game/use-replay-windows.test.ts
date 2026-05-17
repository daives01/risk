/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  REPLAY_WINDOW_SIZE,
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
});
