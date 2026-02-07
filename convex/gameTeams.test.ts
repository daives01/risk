import { describe, expect, test } from "bun:test";
import {
  createBalancedTeamAssignments,
  resolveEngineTeamsConfig,
  resolveTeamModeConfig,
  validateTeamAssignments,
} from "./gameTeams";

describe("team mode config", () => {
  test("defaults to disabled manual mode", () => {
    expect(resolveTeamModeConfig({})).toEqual({
      enabled: false,
      assignmentStrategy: "manual",
    });
  });

  test("deterministically creates balanced teams", () => {
    const userIds = ["u1", "u2", "u3", "u4"];
    const first = createBalancedTeamAssignments(userIds, "seed-1");
    const second = createBalancedTeamAssignments(userIds, "seed-1");
    expect(first).toEqual(second);

    const team1 = Object.values(first).filter((teamId) => teamId === "team-1").length;
    const team2 = Object.values(first).filter((teamId) => teamId === "team-2").length;
    expect(Math.abs(team1 - team2)).toBeLessThanOrEqual(1);
  });

  test("validates missing and unbalanced assignments", () => {
    expect(
      validateTeamAssignments(["u1", "u2"], { u1: "team-1", u2: undefined }),
    ).toContain("Every player must be assigned to a team");

    expect(
      validateTeamAssignments(["u1", "u2", "u3"], {
        u1: "team-1",
        u2: "team-1",
        u3: "team-1",
      }),
    ).toContain("Each team must have at least one player");
  });

  test("enables team permissions in engine config", () => {
    const config = resolveEngineTeamsConfig({ enabled: true, assignmentStrategy: "manual" });
    expect(config.teamsEnabled).toBe(true);
    expect(config.allowPlaceOnTeammate).toBe(true);
    expect(config.allowFortifyWithTeammate).toBe(true);
    expect(config.allowFortifyThroughTeammates).toBe(true);
  });
});
