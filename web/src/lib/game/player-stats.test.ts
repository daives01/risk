/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { buildPlayerPanelStats } from "./player-stats";
import type { PublicState } from "./types";

describe("buildPlayerPanelStats", () => {
  test("returns territory, army, reserve, card, and team info per player", () => {
    const state: PublicState = {
      players: {
        p1: { status: "alive", teamId: "team-1" },
        p2: { status: "defeated", teamId: "team-2" },
      },
      turnOrder: ["p1", "p2"],
      territories: {
        t1: { ownerId: "p1", armies: 3 },
        t2: { ownerId: "p1", armies: 2 },
        t3: { ownerId: "p2", armies: 7 },
      },
      turn: { currentPlayerId: "p1", phase: "Reinforcement", round: 5 },
      reinforcements: { remaining: 4 },
      capturedThisTurn: false,
      tradesCompleted: 1,
      deckCount: 20,
      discardCount: 5,
      handSizes: { p1: 2, p2: 3 },
      stateVersion: 11,
    };

    expect(buildPlayerPanelStats(state)).toEqual([
      {
        playerId: "p1",
        territories: 2,
        armies: 5,
        reserveTroops: 4,
        cards: 2,
        status: "alive",
        teamId: "team-1",
      },
      {
        playerId: "p2",
        territories: 1,
        armies: 7,
        reserveTroops: 0,
        cards: 3,
        status: "defeated",
        teamId: "team-2",
      },
    ]);
  });
});

