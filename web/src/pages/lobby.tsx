import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { Copy, Play, Shuffle, UserRoundPlus, Users, X } from "lucide-react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RulesetOverridesInput = {
  combat: { allowAttackerDiceChoice: boolean };
  fortify: { fortifyMode: "adjacent" | "connected"; maxFortifiesPerTurn?: number };
  cards: { forcedTradeHandSize: number; awardCardOnCapture: boolean };
  teams: {
    preventAttackingTeammates: boolean;
    allowPlaceOnTeammate: boolean;
    allowFortifyWithTeammate: boolean;
    allowFortifyThroughTeammates: boolean;
  };
};

export default function LobbyPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const lobby = useQuery(api.lobby.getLobby, gameId ? { gameId: gameId as Id<"games"> } : "skip");
  const kickPlayer = useMutation(api.lobby.kickPlayer);
  const startGame = useMutation(api.lobby.startGame);
  const setPlayerTeam = useMutation(api.lobby.setPlayerTeam);
  const rebalanceTeams = useMutation(api.lobby.rebalanceTeams);
  const setRulesetOverrides = useMutation(api.lobby.setRulesetOverrides);

  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [fortifyMode, setFortifyMode] = useState<"adjacent" | "connected">("connected");
  const [maxFortifiesPerTurn, setMaxFortifiesPerTurn] = useState<number | "unlimited">("unlimited");
  const [forcedTradeHandSize, setForcedTradeHandSize] = useState(5);
  const [awardCardOnCapture, setAwardCardOnCapture] = useState(true);
  const [allowAttackerDiceChoice, setAllowAttackerDiceChoice] = useState(true);
  const [preventAttackingTeammates, setPreventAttackingTeammates] = useState(true);
  const [allowPlaceOnTeammate, setAllowPlaceOnTeammate] = useState(true);
  const [allowFortifyWithTeammate, setAllowFortifyWithTeammate] = useState(true);
  const [allowFortifyThroughTeammates, setAllowFortifyThroughTeammates] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lobby) return;
    const overrides = lobby.game.rulesetOverrides as Partial<RulesetOverridesInput> | null;
    setFortifyMode(overrides?.fortify?.fortifyMode ?? "connected");
    setMaxFortifiesPerTurn(
      overrides?.fortify?.maxFortifiesPerTurn === undefined
        ? "unlimited"
        : overrides.fortify.maxFortifiesPerTurn,
    );
    setForcedTradeHandSize(overrides?.cards?.forcedTradeHandSize ?? 5);
    setAwardCardOnCapture(overrides?.cards?.awardCardOnCapture ?? true);
    setAllowAttackerDiceChoice(overrides?.combat?.allowAttackerDiceChoice ?? true);
    setPreventAttackingTeammates(overrides?.teams?.preventAttackingTeammates ?? true);
    setAllowPlaceOnTeammate(overrides?.teams?.allowPlaceOnTeammate ?? true);
    setAllowFortifyWithTeammate(overrides?.teams?.allowFortifyWithTeammate ?? true);
    setAllowFortifyThroughTeammates(overrides?.teams?.allowFortifyThroughTeammates ?? true);
  }, [lobby]);

  if (sessionPending) {
    return <div className="page-shell flex items-center justify-center">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (lobby === undefined) {
    return <div className="page-shell flex items-center justify-center">Loading lobby...</div>;
  }

  if (lobby === null) {
    return (
      <div className="page-shell flex items-center justify-center">
        <Card className="glass-panel w-full max-w-md border-0 py-0">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Game not found.</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/")}>Go home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (lobby.game.status === "active" || lobby.game.status === "finished") {
    return <Navigate to={`/play/${gameId}`} replace />;
  }

  const userId = session.user.id;
  const isHost = lobby.game.createdBy === userId;
  const teamModeEnabled = lobby.game.teamModeEnabled;
  const inviteUrl = lobby.inviteCode ? `${window.location.origin}/join/${lobby.inviteCode}` : null;
  const team1Count = lobby.players.filter((player) => player.teamId === "team-1").length;
  const team2Count = lobby.players.filter((player) => player.teamId === "team-2").length;
  const playersMissingTeam = lobby.players.filter((player) => !player.teamId).length;
  const teamSetupValid = !teamModeEnabled || (
    playersMissingTeam === 0 &&
    team1Count > 0 &&
    team2Count > 0 &&
    Math.abs(team1Count - team2Count) <= 1
  );

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function handleStart() {
    if (!gameId) return;
    setError(null);
    setStarting(true);
    try {
      await startGame({ gameId: gameId as Id<"games"> });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start game");
    } finally {
      setStarting(false);
    }
  }

  async function handleKick(targetUserId: string) {
    if (!gameId) return;
    try {
      await kickPlayer({ gameId: gameId as Id<"games">, userId: targetUserId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to kick player");
    }
  }

  async function handleTeamChange(targetUserId: string, teamId: "team-1" | "team-2") {
    if (!gameId) return;
    try {
      await setPlayerTeam({ gameId: gameId as Id<"games">, userId: targetUserId, teamId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set team");
    }
  }

  async function handleRebalance() {
    if (!gameId) return;
    setError(null);
    setRebalancing(true);
    try {
      await rebalanceTeams({ gameId: gameId as Id<"games"> });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rebalance teams");
    } finally {
      setRebalancing(false);
    }
  }

  async function handleSaveRules() {
    if (!gameId) return;
    setError(null);
    setSavingRules(true);
    try {
      const rulesetOverrides: RulesetOverridesInput = {
        combat: { allowAttackerDiceChoice },
        fortify: {
          fortifyMode,
          ...(maxFortifiesPerTurn === "unlimited" ? {} : { maxFortifiesPerTurn }),
        },
        cards: {
          forcedTradeHandSize,
          awardCardOnCapture,
        },
        teams: {
          preventAttackingTeammates,
          allowPlaceOnTeammate,
          allowFortifyWithTeammate,
          allowFortifyThroughTeammates,
        },
      };
      await setRulesetOverrides({
        gameId: gameId as Id<"games">,
        rulesetOverrides,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rules");
    } finally {
      setSavingRules(false);
    }
  }

  return (
    <div className="page-shell soft-grid">
      <div className="page-container mx-auto max-w-3xl">
        <Card className="glass-panel border-0 py-0">
          <CardHeader className="py-6">
            <CardTitle className="hero-title">{lobby.game.name}</CardTitle>
            <p className="text-sm text-muted-foreground">Waiting for players ({lobby.players.length}/{lobby.game.maxPlayers})</p>
          </CardHeader>
          <CardContent className="space-y-5 pb-6">
            {error && <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            {inviteUrl && (
              <div className="space-y-2 rounded-lg border bg-background/75 p-3">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Invite</p>
                <div className="flex gap-2">
                  <code className="flex-1 truncate rounded-md border bg-muted/60 px-3 py-2 text-sm">{inviteUrl}</code>
                  <Button type="button" variant="outline" onClick={copyInvite}>
                    <Copy className="size-4" />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Code: <span className="font-mono font-semibold">{lobby.inviteCode}</span></p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Players</p>
              <div className="space-y-2">
                {lobby.players.map((player) => (
                  <div key={player.userId} className="flex items-center justify-between rounded-lg border bg-background/75 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <UserRoundPlus className="size-4 text-primary" />
                      <span className="font-medium">{player.displayName}</span>
                      {player.role === "host" && <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-xs text-primary">Host</span>}
                      {player.userId === userId && <span className="text-xs text-muted-foreground">(you)</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {teamModeEnabled && (
                        isHost ? (
                          <select
                            value={player.teamId ?? ""}
                            onChange={(event) => {
                              const teamId = event.target.value as "team-1" | "team-2";
                              if (teamId) void handleTeamChange(player.userId, teamId);
                            }}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value="">No team</option>
                            <option value="team-1">Team 1</option>
                            <option value="team-2">Team 2</option>
                          </select>
                        ) : (
                          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                            {player.teamId === "team-1" ? "Team 1" : player.teamId === "team-2" ? "Team 2" : "No team"}
                          </span>
                        )
                      )}
                      {isHost && player.role !== "host" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleKick(player.userId)}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="size-4" />
                          Kick
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {teamModeEnabled && (
              <div className="space-y-2 rounded-lg border bg-background/75 p-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-muted-foreground">
                    <Users className="size-3.5" />
                    Teams
                  </p>
                  {isHost && (
                    <Button variant="outline" size="sm" onClick={handleRebalance} disabled={rebalancing}>
                      <Shuffle className="size-4" />
                      {rebalancing ? "Rebalancing..." : "Auto rebalance"}
                    </Button>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Team 1: {team1Count} | Team 2: {team2Count} | Unassigned: {playersMissingTeam}
                </p>
                {!teamSetupValid && (
                  <p className="text-sm text-destructive">
                    Assign every player and keep teams balanced (difference at most 1).
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2 rounded-lg border bg-background/75 p-3">
              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Game Rules</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-muted-foreground">
                  Fortify mode
                  <select
                    value={fortifyMode}
                    onChange={(event) => setFortifyMode(event.target.value as "adjacent" | "connected")}
                    disabled={!isHost}
                    className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="connected">Connected</option>
                    <option value="adjacent">Adjacent</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  Fortifies / turn
                  <select
                    value={maxFortifiesPerTurn}
                    onChange={(event) =>
                      setMaxFortifiesPerTurn(
                        event.target.value === "unlimited"
                          ? "unlimited"
                          : Number(event.target.value),
                      )
                    }
                    disabled={!isHost}
                    className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="unlimited">Unlimited</option>
                    <option value={0}>0</option>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </label>
                <label className="text-xs text-muted-foreground">
                  Forced trade hand size
                  <input
                    type="number"
                    min={3}
                    max={12}
                    value={forcedTradeHandSize}
                    onChange={(event) => setForcedTradeHandSize(Number(event.target.value))}
                    disabled={!isHost}
                    className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={awardCardOnCapture} disabled={!isHost} onChange={(event) => setAwardCardOnCapture(event.target.checked)} />
                Award card on capture
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={allowAttackerDiceChoice} disabled={!isHost} onChange={(event) => setAllowAttackerDiceChoice(event.target.checked)} />
                Allow attacker dice choice
              </label>
              {teamModeEnabled && (
                <>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={preventAttackingTeammates} disabled={!isHost} onChange={(event) => setPreventAttackingTeammates(event.target.checked)} />
                    Prevent attacking teammates
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={allowPlaceOnTeammate} disabled={!isHost} onChange={(event) => setAllowPlaceOnTeammate(event.target.checked)} />
                    Allow place on teammate
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={allowFortifyWithTeammate} disabled={!isHost} onChange={(event) => setAllowFortifyWithTeammate(event.target.checked)} />
                    Allow fortify with teammate
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={allowFortifyThroughTeammates} disabled={!isHost} onChange={(event) => setAllowFortifyThroughTeammates(event.target.checked)} />
                    Allow fortify through teammates
                  </label>
                </>
              )}
              {isHost ? (
                <Button variant="outline" size="sm" onClick={handleSaveRules} disabled={savingRules}>
                  {savingRules ? "Saving..." : "Save Rules"}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Only host can edit rules.</p>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {isHost && (
                <Button className="flex-1" disabled={starting || lobby.players.length < 2 || !teamSetupValid} onClick={handleStart}>
                  <Play className="size-4" />
                  {starting
                    ? "Starting..."
                    : lobby.players.length < 2
                      ? "Need 2+ players"
                      : !teamSetupValid
                        ? "Fix Team Setup"
                        : "Start Game"}
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate("/")}>Leave</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
