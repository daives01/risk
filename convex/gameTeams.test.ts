import { describe, expect, test } from "bun:test";
import {
  createBalancedTeamAssignments,
  getDefaultTeamNames,
  getTeamIds,
  resolveTeamNames,
  resolveEngineTeamsConfig,
  resolveTeamModeConfig,
  validateTeamNameUniqueness,
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
    const first = createBalancedTeamAssignments(userIds, 2, "seed-1");
    const second = createBalancedTeamAssignments(userIds, 2, "seed-1");
    expect(first).toEqual(second);

    const team1 = Object.values(first).filter((teamId) => teamId === "team-1").length;
    const team2 = Object.values(first).filter((teamId) => teamId === "team-2").length;
    expect(Math.abs(team1 - team2)).toBeLessThanOrEqual(1);
  });

  test("validates missing and unbalanced assignments", () => {
    const teamIds = getTeamIds(2);
    expect(
      validateTeamAssignments(["u1", "u2"], { u1: "team-1", u2: undefined }, teamIds),
    ).toContain("Every player must be assigned to a team");

    expect(
      validateTeamAssignments(["u1", "u2", "u3"], {
        u1: "team-1",
        u2: "team-1",
        u3: "team-1",
      }, teamIds),
    ).toContain("Each team must have at least one player");
  });

  test("supports balancing with more than two teams", () => {
    const assignments = createBalancedTeamAssignments(["u1", "u2", "u3", "u4", "u5", "u6"], 3, "seed");
    const teamIds = getTeamIds(3);
    expect(validateTeamAssignments(Object.keys(assignments), assignments, teamIds)).toEqual([]);
  });

  test("resolves team names with defaults and persisted values", () => {
    const teamIds = getTeamIds(3);
    expect(getDefaultTeamNames(teamIds)).toEqual({
      "team-1": "Team 1",
      "team-2": "Team 2",
      "team-3": "Team 3",
    });
    expect(resolveTeamNames(teamIds, { "team-2": "Blue Squad" })).toEqual({
      "team-1": "Team 1",
      "team-2": "Blue Squad",
      "team-3": "Team 3",
    });
  });

  test("validates team name uniqueness and length", () => {
    const teamNames = {
      "team-1": "Alpha",
      "team-2": "Beta",
    };
    expect(() => validateTeamNameUniqueness("team-1", "  ", teamNames)).toThrow(/cannot be empty/);
    expect(() => validateTeamNameUniqueness("team-1", "bEtA", teamNames)).toThrow(/must be unique/);
    expect(() => validateTeamNameUniqueness("team-1", "A".repeat(25), teamNames)).toThrow(/24/);
  });

  test("enables team permissions in engine config", () => {
    const config = resolveEngineTeamsConfig({ enabled: true, assignmentStrategy: "manual" });
    expect(config.teamsEnabled).toBe(true);
    expect(config.preventAttackingTeammates).toBe(false);
    expect(config.allowPlaceOnTeammate).toBe(true);
    expect(config.allowFortifyWithTeammate).toBe(true);
    expect(config.allowFortifyThroughTeammates).toBe(true);
  });
});
