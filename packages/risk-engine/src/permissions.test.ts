import { describe, expect, test } from "bun:test";
import { canPlace, canAttack, canFortifyFrom, canFortifyTo, canTraverse } from "./permissions.js";
import type { PlayerId, PlayerState, TeamId } from "./types.js";
import type { TeamsConfig } from "./config.js";

const P1 = "p1" as PlayerId;
const P2 = "p2" as PlayerId;
const P3 = "p3" as PlayerId;
const TEAM_A = "teamA" as TeamId;
const TEAM_B = "teamB" as TeamId;

const noTeamPlayers: Record<string, PlayerState> = {
  p1: { status: "alive" },
  p2: { status: "alive" },
};

const teamPlayers: Record<string, PlayerState> = {
  p1: { status: "alive", teamId: TEAM_A },
  p2: { status: "alive", teamId: TEAM_A },
  p3: { status: "alive", teamId: TEAM_B },
};

const teamsEnabled: TeamsConfig = {
  teamsEnabled: true,
  preventAttackingTeammates: true,
  allowPlaceOnTeammate: true,
  allowFortifyWithTeammate: true,
  allowFortifyThroughTeammates: true,
  winCondition: "lastTeamStanding",
  continentBonusRecipient: "majorityHolderOnTeam",
};

const teamsRestricted: TeamsConfig = {
  teamsEnabled: true,
  preventAttackingTeammates: true,
  allowPlaceOnTeammate: false,
  allowFortifyWithTeammate: false,
  allowFortifyThroughTeammates: false,
  winCondition: "lastTeamStanding",
  continentBonusRecipient: "majorityHolderOnTeam",
};

// ── canPlace ───────────────────────────────────────────────────────

describe("canPlace", () => {
  test("always allows placing on own territory", () => {
    expect(canPlace(P1, P1, noTeamPlayers)).toBe(true);
  });

  test("rejects placing on enemy territory without teams", () => {
    expect(canPlace(P1, P2, noTeamPlayers)).toBe(false);
  });

  test("rejects placing on neutral territory", () => {
    expect(canPlace(P1, "neutral", noTeamPlayers)).toBe(false);
  });

  test("allows placing on teammate territory when enabled", () => {
    expect(canPlace(P1, P2, teamPlayers, teamsEnabled)).toBe(true);
  });

  test("rejects placing on teammate territory when disabled", () => {
    expect(canPlace(P1, P2, teamPlayers, teamsRestricted)).toBe(false);
  });

  test("rejects placing on enemy team territory", () => {
    expect(canPlace(P1, P3, teamPlayers, teamsEnabled)).toBe(false);
  });

  test("rejects placing on neutral even with teams", () => {
    expect(canPlace(P1, "neutral", teamPlayers, teamsEnabled)).toBe(false);
  });
});

// ── canAttack ──────────────────────────────────────────────────────

describe("canAttack", () => {
  test("cannot attack own territory", () => {
    expect(canAttack(P1, P1, noTeamPlayers)).toBe(false);
  });

  test("can attack enemy territory", () => {
    expect(canAttack(P1, P2, noTeamPlayers)).toBe(true);
  });

  test("can attack neutral territory", () => {
    expect(canAttack(P1, "neutral", noTeamPlayers)).toBe(true);
  });

  test("cannot attack teammate when prevented", () => {
    expect(canAttack(P1, P2, teamPlayers, teamsEnabled)).toBe(false);
  });

  test("can attack enemy team", () => {
    expect(canAttack(P1, P3, teamPlayers, teamsEnabled)).toBe(true);
  });

  test("can attack neutral with teams", () => {
    expect(canAttack(P1, "neutral", teamPlayers, teamsEnabled)).toBe(true);
  });

  test("can attack teammate when not prevented", () => {
    const config: TeamsConfig = { ...teamsEnabled, preventAttackingTeammates: false };
    expect(canAttack(P1, P2, teamPlayers, config)).toBe(true);
  });
});

// ── canFortifyFrom ─────────────────────────────────────────────────

describe("canFortifyFrom", () => {
  test("allows own territory", () => {
    expect(canFortifyFrom(P1, P1, noTeamPlayers)).toBe(true);
  });

  test("rejects enemy territory without teams", () => {
    expect(canFortifyFrom(P1, P2, noTeamPlayers)).toBe(false);
  });

  test("allows teammate territory when enabled", () => {
    expect(canFortifyFrom(P1, P2, teamPlayers, teamsEnabled)).toBe(true);
  });

  test("rejects teammate territory when disabled", () => {
    expect(canFortifyFrom(P1, P2, teamPlayers, teamsRestricted)).toBe(false);
  });

  test("rejects neutral", () => {
    expect(canFortifyFrom(P1, "neutral", teamPlayers, teamsEnabled)).toBe(false);
  });
});

// ── canFortifyTo ───────────────────────────────────────────────────

describe("canFortifyTo", () => {
  test("allows own territory", () => {
    expect(canFortifyTo(P1, P1, noTeamPlayers)).toBe(true);
  });

  test("rejects enemy territory without teams", () => {
    expect(canFortifyTo(P1, P2, noTeamPlayers)).toBe(false);
  });

  test("allows teammate territory when enabled", () => {
    expect(canFortifyTo(P1, P2, teamPlayers, teamsEnabled)).toBe(true);
  });

  test("rejects teammate territory when disabled", () => {
    expect(canFortifyTo(P1, P2, teamPlayers, teamsRestricted)).toBe(false);
  });
});

// ── canTraverse ────────────────────────────────────────────────────

describe("canTraverse", () => {
  test("allows own territory", () => {
    expect(canTraverse(P1, P1, noTeamPlayers)).toBe(true);
  });

  test("rejects enemy territory without teams", () => {
    expect(canTraverse(P1, P2, noTeamPlayers)).toBe(false);
  });

  test("allows teammate territory when enabled", () => {
    expect(canTraverse(P1, P2, teamPlayers, teamsEnabled)).toBe(true);
  });

  test("rejects teammate territory when disabled", () => {
    expect(canTraverse(P1, P2, teamPlayers, teamsRestricted)).toBe(false);
  });

  test("rejects neutral", () => {
    expect(canTraverse(P1, "neutral", teamPlayers, teamsEnabled)).toBe(false);
  });

  test("rejects enemy team territory", () => {
    expect(canTraverse(P1, P3, teamPlayers, teamsEnabled)).toBe(false);
  });
});
