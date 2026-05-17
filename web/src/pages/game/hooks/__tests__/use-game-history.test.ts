/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  buildHistoryFrameLabel,
  buildHistoryEvents,
  clampHistoryFrameIndex,
} from "../use-game-history";
import type { GameAction } from "../../../../lib/game/types";

describe("useGameHistory helpers", () => {
  test("groups adjacent attacks between same territories", () => {
    const timelineActions: GameAction[] = [
      {
        _id: "a1",
        index: 2,
        events: [
          { type: "AttackResolved", from: "na", to: "eu", attackerLosses: 1, defenderLosses: 2 },
          { type: "AttackResolved", from: "na", to: "eu", attackerLosses: 0, defenderLosses: 1 },
          { type: "AttackResolved", from: "sa", to: "na", attackerLosses: 2, defenderLosses: 0 },
        ],
      },
    ];

    const events = buildHistoryEvents({
      timelineActions,
      graphMap: {
        territories: {
          na: { name: "North America" },
          eu: { name: "Europe" },
          sa: { name: "South America" },
        },
        adjacency: {},
      },
      playerMap: [],
    });

    expect(events[0]?.text).toContain("South America attacked North America");
    expect(events[1]?.text).toContain("North America attacked Europe x2");
    expect(events[1]?.text).toContain("(-1/-3)");
  });

  test("summarizes multiple reinforcement placements in one action", () => {
    const timelineActions: GameAction[] = [
      {
        _id: "a2",
        index: 3,
        events: [
          { type: "ReinforcementsPlaced", playerId: "p1", territoryId: "na", count: 2 },
          { type: "ReinforcementsPlaced", playerId: "p1", territoryId: "na", count: 1 },
          { type: "ReinforcementsPlaced", playerId: "p1", territoryId: "sa", count: 3 },
        ],
      },
    ];

    const events = buildHistoryEvents({
      timelineActions,
      graphMap: {
        territories: {
          na: { name: "North America" },
          sa: { name: "South America" },
        },
        adjacency: {},
      },
      playerMap: [{ displayName: "Alex", enginePlayerId: "p1" }],
    });

    expect(events[0]?.text).toBe("Alex placed 6 armies: North America +3, South America +3");
  });

  test("labels turn advancement with the next player instead of a raw action number", () => {
    const label = buildHistoryFrameLabel({
      action: {
        _id: "a3",
        index: 342,
        events: [
          { type: "TurnEnded", playerId: "p1" },
          { type: "TurnAdvanced", nextPlayerId: "p2", round: 7 },
          { type: "ReinforcementsGranted", playerId: "p2", amount: 5 },
        ],
      },
      graphMap: { territories: {}, adjacency: {} },
      playerMap: [
        { displayName: "Alex", enginePlayerId: "p1" },
        { displayName: "Blair", enginePlayerId: "p2" },
      ],
    });

    expect(label).toBe("Blair starts round 7");
  });

  test("labels timed-out turns with readable player copy", () => {
    const label = buildHistoryFrameLabel({
      action: {
        _id: "a4",
        index: 343,
        events: [
          { type: "TurnTimedOut", playerId: "p1" },
          { type: "TurnEnded", playerId: "p1" },
          { type: "TurnAdvanced", nextPlayerId: "p2", round: 7 },
        ],
      },
      graphMap: { territories: {}, adjacency: {} },
      playerMap: [
        { displayName: "Alex", enginePlayerId: "p1" },
        { displayName: "Blair", enginePlayerId: "p2" },
      ],
    });

    expect(label).toBe("Alex ran out of time");
  });

  test("clamps frame index", () => {
    expect(clampHistoryFrameIndex(8, 3)).toBe(2);
  });
});
