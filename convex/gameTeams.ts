import { createRng, defaultRuleset } from "risk-engine";
import type { TeamsConfig } from "risk-engine";

export const TEAM_IDS = ["team-1", "team-2"] as const;
export type TeamId = (typeof TEAM_IDS)[number];

export type TeamAssignmentStrategy = "manual" | "balancedRandom";

export interface TeamModeConfig {
  enabled: boolean;
  assignmentStrategy: TeamAssignmentStrategy;
}

export function resolveTeamModeConfig(game: {
  teamModeEnabled?: boolean;
  teamAssignmentStrategy?: TeamAssignmentStrategy;
}): TeamModeConfig {
  return {
    enabled: game.teamModeEnabled ?? false,
    assignmentStrategy: game.teamAssignmentStrategy ?? "manual",
  };
}

export function resolveEngineTeamsConfig(teamMode: TeamModeConfig): TeamsConfig {
  if (!teamMode.enabled) return defaultRuleset.teams;

  return {
    ...defaultRuleset.teams,
    teamsEnabled: true,
    preventAttackingTeammates: true,
    allowPlaceOnTeammate: true,
    allowFortifyWithTeammate: true,
    allowFortifyThroughTeammates: true,
    winCondition: "lastTeamStanding",
    continentBonusRecipient: "majorityHolderOnTeam",
  };
}

export function createBalancedTeamAssignments(
  userIds: readonly string[],
  seed: string,
): Record<string, TeamId> {
  const rng = createRng({ seed, index: 0 });
  const shuffled = rng.shuffle([...userIds]);

  const assignments: Record<string, TeamId> = {};
  for (let i = 0; i < shuffled.length; i += 1) {
    assignments[shuffled[i]!] = TEAM_IDS[i % TEAM_IDS.length]!;
  }

  return assignments;
}

export function validateTeamAssignments(
  userIds: readonly string[],
  assignments: Record<string, string | undefined>,
): string[] {
  const errors: string[] = [];
  if (userIds.length === 0) return errors;

  const teamSizes: Record<TeamId, number> = {
    "team-1": 0,
    "team-2": 0,
  };

  for (const userId of userIds) {
    const teamId = assignments[userId];
    if (!teamId) {
      errors.push("Every player must be assigned to a team");
      break;
    }
    if (!TEAM_IDS.includes(teamId as TeamId)) {
      errors.push(`Invalid team id: ${teamId}`);
      continue;
    }
    teamSizes[teamId as TeamId] += 1;
  }

  if (teamSizes["team-1"] === 0 || teamSizes["team-2"] === 0) {
    errors.push("Each team must have at least one player");
  }

  if (Math.abs(teamSizes["team-1"] - teamSizes["team-2"]) > 1) {
    errors.push("Teams must be balanced (size difference at most 1)");
  }

  return errors;
}
