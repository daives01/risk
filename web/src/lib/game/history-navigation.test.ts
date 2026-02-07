/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import type { HistoryFrame } from "./types";
import {
  findNextCaptureFrame,
  findNextEliminationFrame,
  findNextTurnBoundary,
  findPreviousTurnBoundary,
} from "./history-navigation";

function frame(overrides: Partial<HistoryFrame>): HistoryFrame {
  return {
    index: 0,
    actionType: "Test",
    label: "label",
    actorId: "p1",
    turnRound: 1,
    turnPlayerId: "p1",
    turnPhase: "Reinforcement",
    hasCapture: false,
    eliminatedPlayerIds: [],
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
    ...overrides,
  };
}

describe("history navigation", () => {
  const frames: HistoryFrame[] = [
    frame({ index: -1, actionType: "Start", actorId: null, label: "start" }),
    frame({ index: 0, turnRound: 1, turnPlayerId: "p1" }),
    frame({ index: 1, turnRound: 1, turnPlayerId: "p1", hasCapture: true }),
    frame({ index: 2, turnRound: 1, turnPlayerId: "p2" }),
    frame({ index: 3, turnRound: 1, turnPlayerId: "p2", eliminatedPlayerIds: ["p3"] }),
    frame({ index: 4, turnRound: 2, turnPlayerId: "p1" }),
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
});
