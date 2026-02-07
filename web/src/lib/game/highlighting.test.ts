/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { resolveHighlightedTerritoryIds, togglePlayerHighlight, toggleTeamHighlight } from "./highlighting";
import type { PublicState } from "./types";

const baseState: PublicState = {
  players: {
    p1: { status: "alive", teamId: "team-1" },
    p2: { status: "alive", teamId: "team-1" },
    p3: { status: "alive", teamId: "team-2" },
  },
  turnOrder: ["p1", "p2", "p3"],
  territories: {
    alaska: { ownerId: "p1", armies: 3 },
    alberta: { ownerId: "p2", armies: 4 },
    ontario: { ownerId: "p3", armies: 5 },
    greenland: { ownerId: "neutral", armies: 2 },
  },
  turn: { currentPlayerId: "p1", phase: "Attack", round: 2 },
  capturedThisTurn: false,
  tradesCompleted: 0,
  deckCount: 10,
  discardCount: 3,
  handSizes: { p1: 1, p2: 2, p3: 0 },
  stateVersion: 7,
};

describe("game highlight filtering", () => {
  test("toggles player and team highlights", () => {
    expect(togglePlayerHighlight("none", "p1")).toBe("player:p1");
    expect(togglePlayerHighlight("player:p1", "p1")).toBe("none");
    expect(toggleTeamHighlight("none", "team-1")).toBe("team:team-1");
    expect(toggleTeamHighlight("team:team-1", "team-1")).toBe("none");
  });

  test("resolves player and team territory highlights", () => {
    expect(Array.from(resolveHighlightedTerritoryIds(baseState, "player:p2")).sort()).toEqual(["alberta"]);
    expect(Array.from(resolveHighlightedTerritoryIds(baseState, "team:team-1")).sort()).toEqual([
      "alaska",
      "alberta",
    ]);
    expect(resolveHighlightedTerritoryIds(baseState, "none").size).toBe(0);
  });
});

