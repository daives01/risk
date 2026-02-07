import { describe, expect, test } from "bun:test";
import { normalizeChatMessage, resolveTeamChannelAccess } from "./gameChat";

describe("game chat", () => {
  test("normalizes and validates message content", () => {
    expect(normalizeChatMessage("  hello team  ")).toBe("hello team");
    expect(() => normalizeChatMessage("   ")).toThrow("Message cannot be empty");
    expect(() => normalizeChatMessage("x".repeat(301))).toThrow("Message cannot exceed 300 characters");
  });

  test("allows global access without team assignment", () => {
    expect(
      resolveTeamChannelAccess({
        channel: "global",
        teamModeEnabled: false,
        playerTeamId: null,
      }),
    ).toBeNull();
  });

  test("restricts team channel to team-mode members", () => {
    expect(() =>
      resolveTeamChannelAccess({
        channel: "team",
        teamModeEnabled: false,
        playerTeamId: "team-1",
      }),
    ).toThrow("Team chat is unavailable in this game");

    expect(() =>
      resolveTeamChannelAccess({
        channel: "team",
        teamModeEnabled: true,
        playerTeamId: null,
      }),
    ).toThrow("You are not assigned to a team in this game");

    expect(
      resolveTeamChannelAccess({
        channel: "team",
        teamModeEnabled: true,
        playerTeamId: "team-2",
      }),
    ).toBe("team-2");
  });
});
