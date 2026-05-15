interface RulesetSummaryProps {
  cardIncrementLabel: string;
  timingModeLabel: string;
  showExcludeWeekends?: boolean;
  excludeWeekends?: boolean;
  fortifyMode: string;
  maxFortifiesPerTurn: number | "unlimited";
  forcedTradeHandSize: number;
  teamModeEnabled: boolean;
  allowPlaceOnTeammate: boolean;
  allowFortifyWithTeammate: boolean;
  allowFortifyThroughTeammates: boolean;
  showSlackNotifications?: boolean;
  slackNotificationsEnabled?: boolean;
  slackWorkspaceLabel?: string | null;
}

export function RulesetSummary({
  cardIncrementLabel,
  timingModeLabel,
  showExcludeWeekends = false,
  excludeWeekends = false,
  fortifyMode,
  maxFortifiesPerTurn,
  forcedTradeHandSize,
  teamModeEnabled,
  allowPlaceOnTeammate,
  allowFortifyWithTeammate,
  allowFortifyThroughTeammates,
  showSlackNotifications = false,
  slackNotificationsEnabled = false,
  slackWorkspaceLabel,
}: RulesetSummaryProps) {
  return (
    <div className="space-y-1 text-xs">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/80">Game Flow</p>
      <p><span className="text-muted-foreground">Card reward increment: </span><span className="text-foreground">{cardIncrementLabel}</span></p>
      <p><span className="text-muted-foreground">Turn timing: </span><span className="text-foreground">{timingModeLabel}</span></p>
      {showExcludeWeekends && <p><span className="text-muted-foreground">Exclude weekends (EU mode): </span><span className="text-foreground">{excludeWeekends ? "On" : "Off"}</span></p>}
      <p className="pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/80">Fortify Rules</p>
      <p><span className="text-muted-foreground">Fortify mode: </span><span className="text-foreground">{fortifyMode}</span></p>
      <p><span className="text-muted-foreground">Fortifies per turn: </span><span className="text-foreground">{maxFortifiesPerTurn}</span></p>
      <p><span className="text-muted-foreground">Forced trade hand size: </span><span className="text-foreground">{forcedTradeHandSize}</span></p>
      {teamModeEnabled && (
        <>
          <p className="pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/80">Team Rules</p>
          <p><span className="text-muted-foreground">Allow place on teammate: </span><span className="text-foreground">{allowPlaceOnTeammate ? "Yes" : "No"}</span></p>
          <p><span className="text-muted-foreground">Allow fortifying teammates: </span><span className="text-foreground">{allowFortifyWithTeammate ? "Yes" : "No"}</span></p>
          <p><span className="text-muted-foreground">Allow fortify through teammate chain: </span><span className="text-foreground">{allowFortifyThroughTeammates ? "Yes" : "No"}</span></p>
        </>
      )}
      {showSlackNotifications && (
        <>
          <p className="pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/80">Slack Notifications</p>
          <p><span className="text-muted-foreground">Enabled: </span><span className="text-foreground">{slackNotificationsEnabled ? "Yes" : "No"}</span></p>
          {slackNotificationsEnabled && <p><span className="text-muted-foreground">Workspace: </span><span className="text-foreground">{slackWorkspaceLabel ?? "Unknown"}</span></p>}
        </>
      )}
    </div>
  );
}
