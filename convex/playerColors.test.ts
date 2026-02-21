import { describe, expect, test } from "bun:test";
import { PLAYER_COLOR_PALETTE } from "risk-engine";
import {
  canEditPlayerColor,
  firstAvailablePlayerColor,
  resolvePlayerColors,
  resolveTeamAwarePlayerColors,
} from "./playerColors";

describe("player colors", () => {
  test("host can edit any player color and players can edit self only", () => {
    expect(canEditPlayerColor("host", "host", "p1")).toBe(true);
    expect(canEditPlayerColor("p1", "host", "p1")).toBe(true);
    expect(canEditPlayerColor("p1", "host", "p2")).toBe(false);
  });

  test("resolves deterministic unique fallback colors for missing or duplicate values", () => {
    const first = resolvePlayerColors([
      { userId: "u2", joinedAt: 2, color: PLAYER_COLOR_PALETTE[0] },
      { userId: "u1", joinedAt: 1, color: PLAYER_COLOR_PALETTE[0] },
      { userId: "u3", joinedAt: 3, color: null },
      { userId: "u4", joinedAt: 4, color: "#not-in-palette" },
    ]);

    const second = resolvePlayerColors([
      { userId: "u2", joinedAt: 2, color: PLAYER_COLOR_PALETTE[0] },
      { userId: "u1", joinedAt: 1, color: PLAYER_COLOR_PALETTE[0] },
      { userId: "u3", joinedAt: 3, color: null },
      { userId: "u4", joinedAt: 4, color: "#not-in-palette" },
    ]);

    expect(first).toEqual(second);
    expect(new Set(Object.values(first)).size).toBe(4);
    expect(first.u1).toBe(PLAYER_COLOR_PALETTE[0]);
    expect(first.u2).toBe(PLAYER_COLOR_PALETTE[PLAYER_COLOR_PALETTE.length - 1]);
  });

  test("returns next available palette color", () => {
    const next = firstAvailablePlayerColor([
      { userId: "u1", joinedAt: 1, color: PLAYER_COLOR_PALETTE[0] },
      { userId: "u2", joinedAt: 2, color: PLAYER_COLOR_PALETTE[1] },
    ]);
    expect(next).toBe(PLAYER_COLOR_PALETTE[PLAYER_COLOR_PALETTE.length - 1]);
  });

  test("resolves deterministic unique colors for assigned teams", () => {
    const players = [
      { userId: "u1", joinedAt: 1, color: null },
      { userId: "u2", joinedAt: 2, color: null },
      { userId: "u3", joinedAt: 3, color: null },
      { userId: "u4", joinedAt: 4, color: null },
      { userId: "u5", joinedAt: 5, color: null },
      { userId: "u6", joinedAt: 6, color: null },
    ];
    const teams = {
      u1: "team-1",
      u2: "team-1",
      u3: "team-1",
      u4: "team-2",
      u5: "team-2",
      u6: "team-2",
    };

    const first = resolveTeamAwarePlayerColors(players, teams);
    const second = resolveTeamAwarePlayerColors(players, teams);

    expect(first).toEqual(second);
    expect(new Set(Object.values(first)).size).toBe(players.length);
  });

  test("falls back to standard resolution when team assignments are missing", () => {
    const players = [
      { userId: "u1", joinedAt: 1, color: null },
      { userId: "u2", joinedAt: 2, color: null },
      { userId: "u3", joinedAt: 3, color: null },
    ];
    const teamAware = resolveTeamAwarePlayerColors(players, {
      u1: "team-1",
      u2: undefined,
      u3: undefined,
    });
    const standard = resolvePlayerColors(players);

    expect(teamAware).toEqual(standard);
  });
});
