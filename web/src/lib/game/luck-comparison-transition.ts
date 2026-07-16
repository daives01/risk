export type LuckComparisonMode = "individual" | "teams";
export type TeamLuckSubjectId = `team:${string}`;

export function toTeamLuckSubjectId(teamId: string): TeamLuckSubjectId {
  return `team:${teamId}`;
}

export function fromTeamLuckSubjectId(subjectId: TeamLuckSubjectId): string {
  return subjectId.slice("team:".length);
}

interface LuckComparisonSubject {
  id: string;
  teamId?: string | null;
}

interface ResolveLuckComparisonPresentationArgs {
  comparisonMode: LuckComparisonMode;
  transitionTarget: LuckComparisonMode | null;
  selectedId: string;
  players: LuckComparisonSubject[];
}

export function resolveLuckComparisonPresentation({
  comparisonMode,
  transitionTarget,
  selectedId,
  players,
}: ResolveLuckComparisonPresentationArgs) {
  if (!transitionTarget) return { mode: comparisonMode, selectedId };

  if (transitionTarget === "teams") {
    const player = players.find((subject) => subject.id === selectedId);
    return {
      mode: transitionTarget,
      selectedId: player?.teamId ? toTeamLuckSubjectId(player.teamId) : selectedId,
    };
  }

  const teamId = fromTeamLuckSubjectId(selectedId as TeamLuckSubjectId);
  const member = players.find((subject) => subject.teamId === teamId);
  return {
    mode: transitionTarget,
    selectedId: member?.id ?? selectedId,
  };
}
