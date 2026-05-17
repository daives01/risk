/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { HistoryFrame, PublicState } from "./types";
import {
  findNextCaptureFrame,
  findNextEliminationFrame,
  findNextTurnBoundary,
  findLastTurnEndForPlayer,
  findPreviousTurnBoundary,
  resolveLastTurnEndForPlayer,
} from "./history-navigation";

function frame(overrides: Omit<Partial<HistoryFrame>, "state"> & { state?: Partial<PublicState> }): HistoryFrame {
  const base: HistoryFrame = {
    index: 0,
    events: [],
    state: {
      players: {},
      turnOrder: [],
      territories: {},
      turn: { currentPlayerId: "p1", phase: "Reinforcement", round: 1 },
      capturedThisTurn: false,
      tradesCompleted: 0,
      deckCount: 0,
      discardCount: 0,
      handSizes: {},
      stateVersion: 1,
    },
  };
  return {
    ...base,
    ...overrides,
    state: { ...base.state, ...overrides.state },
  };
}

describe("history navigation", () => {
  const frames: HistoryFrame[] = [
    frame({ index: -1 }),
    frame({ index: 0 }),
    frame({ index: 1, events: [{ type: "TerritoryCaptured" }] }),
    frame({ index: 2, state: { turn: { currentPlayerId: "p2", phase: "Reinforcement", round: 1 } } }),
    frame({
      index: 3,
      events: [{ type: "PlayerEliminated" }],
      state: { turn: { currentPlayerId: "p2", phase: "Reinforcement", round: 1 } },
    }),
    frame({ index: 4, state: { turn: { currentPlayerId: "p1", phase: "Reinforcement", round: 2 } } }),
  ];

  test("finds previous and next turn boundaries", () => {
    expect(findPreviousTurnBoundary(frames, 3)).toBe(3);
    expect(findPreviousTurnBoundary(frames, 2)).toBe(0);
    expect(findNextTurnBoundary(frames, 0)).toBe(3);
    expect(findNextTurnBoundary(frames, 3)).toBe(5);
  });

  test("jumps to next capture and elimination frames", () => {
    expect(findNextCaptureFrame(frames, 0)).toBe(2);
    expect(findNextCaptureFrame(frames, 2)).toBe(2);
    expect(findNextEliminationFrame(frames, 2)).toBe(4);
    expect(findNextEliminationFrame(frames, 4)).toBe(4);
  });

  test("finds the frame after the last turn for a player", () => {
    expect(findLastTurnEndForPlayer(frames, "p1")).toBe(3);
    expect(findLastTurnEndForPlayer(frames, "p2")).toBe(5);
    expect(findLastTurnEndForPlayer(frames, "unknown")).toBe(0);
  });

  test("reports whether the player's last turn boundary is loaded", () => {
    const recentFrames = [
      frame({ index: 100, state: { turn: { currentPlayerId: "p2", phase: "Reinforcement", round: 10 } } }),
      frame({ index: 101, state: { turn: { currentPlayerId: "p3", phase: "Reinforcement", round: 10 } } }),
    ];

    expect(resolveLastTurnEndForPlayer(recentFrames, "p1")).toEqual({ frameIndex: 0, found: false });
    expect(resolveLastTurnEndForPlayer(frames, "p1")).toEqual({ frameIndex: 3, found: true });
  });
});
