import { createRng, defaultRuleset } from "risk-engine";
import type { TeamsConfig } from "risk-engine";

const MIN_TEAM_COUNT = 2;
const MAX_TEAM_NAME_LENGTH = 24;

export type TeamId = string;
export type TeamNamesById = Record<string, string>;

export type TeamAssignmentStrategy = "manual" | "balancedRandom";

export interface TeamModeConfig {
  enabled: boolean;
  assignmentStrategy: TeamAssignmentStrategy;
}

export function getTeamIds(teamCount: number): TeamId[] {
  if (!Number.isInteger(teamCount) || teamCount < MIN_TEAM_COUNT) {
    throw new Error(`Team count must be an integer >= ${MIN_TEAM_COUNT}`);
  }

  return Array.from({ length: teamCount }, (_, index) => `team-${index + 1}`);
}

export function getDefaultTeamNames(teamIds: readonly string[]): TeamNamesById {
  return Object.fromEntries(
    teamIds.map((teamId, index) => [teamId, `Team ${index + 1}`]),
  );
}

export function resolveTeamNames(
  teamIds: readonly string[],
  persisted?: Record<string, string> | null,
): TeamNamesById {
  const defaults = getDefaultTeamNames(teamIds);
  if (!persisted) return defaults;

  for (const teamId of teamIds) {
    const raw = persisted[teamId];
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    defaults[teamId] = trimmed;
  }

  return defaults;
}

export function validateTeamNameUniqueness(
  teamId: string,
  name: string,
  teamNamesById: TeamNamesById,
): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("Team name cannot be empty");
  }
  if (trimmed.length > MAX_TEAM_NAME_LENGTH) {
    throw new Error(`Team name must be ${MAX_TEAM_NAME_LENGTH} characters or fewer`);
  }

  const target = trimmed.toLowerCase();
  for (const [otherTeamId, otherName] of Object.entries(teamNamesById)) {
    if (otherTeamId === teamId) continue;
    if (otherName.trim().toLowerCase() === target) {
      throw new Error("Team names must be unique");
    }
  }
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
    preventAttackingTeammates: false,
    allowPlaceOnTeammate: true,
    allowFortifyWithTeammate: true,
    allowFortifyThroughTeammates: true,
    winCondition: "lastTeamStanding",
    continentBonusRecipient: "majorityHolderOnTeam",
  };
}

export function createBalancedTeamAssignments(
  userIds: readonly string[],
  teamCount: number,
  seed: string,
): Record<string, string> {
  const teamIds = getTeamIds(teamCount);
  const rng = createRng({ seed, index: 0 });
  const shuffled = rng.shuffle([...userIds]);

  const assignments: Record<string, string> = {};
  for (let i = 0; i < shuffled.length; i += 1) {
    assignments[shuffled[i]!] = teamIds[i % teamIds.length]!;
  }

  return assignments;
}

export function validateTeamAssignments(
  userIds: readonly string[],
  assignments: Record<string, string | undefined>,
  teamIds: readonly string[],
): string[] {
  const errors: string[] = [];
  if (userIds.length === 0) return errors;
  if (teamIds.length < MIN_TEAM_COUNT) {
    errors.push(`At least ${MIN_TEAM_COUNT} teams are required`);
    return errors;
  }

  const teamSizes: Record<string, number> = Object.fromEntries(
    teamIds.map((teamId) => [teamId, 0]),
  );

  for (const userId of userIds) {
    const teamId = assignments[userId];
    if (!teamId) {
      errors.push("Every player must be assigned to a team");
      break;
    }
    if (!teamIds.includes(teamId)) {
      errors.push(`Invalid team id: ${teamId}`);
      continue;
    }
    teamSizes[teamId] += 1;
  }

  const hasEmptyTeam = teamIds.some((teamId) => (teamSizes[teamId] ?? 0) === 0);
  if (hasEmptyTeam) {
    errors.push("Each team must have at least one player");
  }

  const sizes = teamIds.map((teamId) => teamSizes[teamId] ?? 0);
  const minSize = Math.min(...sizes);
  const maxSize = Math.max(...sizes);
  if (maxSize - minSize > 1) {
    errors.push("Teams must be balanced (size difference at most 1)");
  }

  return errors;
}
