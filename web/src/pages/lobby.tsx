import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { Copy, Play, Shuffle, UserRoundPlus, Users, X } from "lucide-react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canEditLobbyPlayerColor, getLobbyColorOptions } from "@/lib/lobby-player-colors";

type RulesetOverridesInput = {
  fortify: { fortifyMode: "adjacent" | "connected"; maxFortifiesPerTurn?: number };
  cards: { forcedTradeHandSize: number; tradeValues: number[]; tradeValueOverflow: "repeatLast" | "continueByFive" };
  teams: {
    allowPlaceOnTeammate: boolean;
    allowFortifyWithTeammate: boolean;
    allowFortifyThroughTeammates: boolean;
  };
};

const CARD_INCREMENT_PRESETS = {
  classic: {
    label: "Classic (4,6,8,10,12,15 then +5)",
    tradeValues: [4, 6, 8, 10, 12, 15],
    tradeValueOverflow: "continueByFive" as const,
  },
  flat: {
    label: "Flat (5 every trade)",
    tradeValues: [5],
    tradeValueOverflow: "repeatLast" as const,
  },
  fast: {
    label: "Fast (6,8,10,12,15,20 then +5)",
    tradeValues: [6, 8, 10, 12, 15, 20],
    tradeValueOverflow: "continueByFive" as const,
  },
} as const;

function resolveCardPresetKey(
  tradeValues?: number[],
  tradeValueOverflow?: "repeatLast" | "continueByFive",
): keyof typeof CARD_INCREMENT_PRESETS {
  if (!tradeValues) return "classic";
  for (const [key, preset] of Object.entries(CARD_INCREMENT_PRESETS) as Array<
    [keyof typeof CARD_INCREMENT_PRESETS, (typeof CARD_INCREMENT_PRESETS)[keyof typeof CARD_INCREMENT_PRESETS]]
  >) {
    if (preset.tradeValueOverflow !== (tradeValueOverflow ?? "continueByFive")) continue;
    if (preset.tradeValues.length !== tradeValues.length) continue;
    if (preset.tradeValues.every((value, index) => value === tradeValues[index])) {
      return key;
    }
  }
  return "classic";
}

export default function LobbyPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const lobby = useQuery(api.lobby.getLobby, gameId ? { gameId: gameId as Id<"games"> } : "skip");
  const kickPlayer = useMutation(api.lobby.kickPlayer);
  const startGame = useMutation(api.lobby.startGame);
  const setPlayerTeam = useMutation(api.lobby.setPlayerTeam);
  const rebalanceTeams = useMutation(api.lobby.rebalanceTeams);
  const setTeamCountMutation = useMutation(api.lobby.setTeamCount);
  const setTeamNameMutation = useMutation(api.lobby.setTeamName);
  const setRulesetOverrides = useMutation(api.lobby.setRulesetOverrides);
  const setPlayerColor = useMutation(api.lobby.setPlayerColor);

  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [savingTeams, setSavingTeams] = useState(false);
  const [fortifyMode, setFortifyMode] = useState<"adjacent" | "connected">("connected");
  const [maxFortifiesPerTurn, setMaxFortifiesPerTurn] = useState<number | "unlimited">("unlimited");
  const [forcedTradeHandSize, setForcedTradeHandSize] = useState(5);
  const [cardIncrementPreset, setCardIncrementPreset] = useState<keyof typeof CARD_INCREMENT_PRESETS>("classic");
  const [allowPlaceOnTeammate, setAllowPlaceOnTeammate] = useState(true);
  const [allowFortifyWithTeammate, setAllowFortifyWithTeammate] = useState(true);
  const [allowFortifyThroughTeammates, setAllowFortifyThroughTeammates] = useState(true);
  const [teamCountDraft, setTeamCountDraft] = useState(2);
  const [teamNameDrafts, setTeamNameDrafts] = useState<Record<string, string>>({});
  const [pendingColorByUserId, setPendingColorByUserId] = useState<Record<string, string>>({});
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
    setCardIncrementPreset(
      resolveCardPresetKey(overrides?.cards?.tradeValues, overrides?.cards?.tradeValueOverflow),
    );
    setAllowPlaceOnTeammate(overrides?.teams?.allowPlaceOnTeammate ?? true);
    setAllowFortifyWithTeammate(overrides?.teams?.allowFortifyWithTeammate ?? true);
    setAllowFortifyThroughTeammates(overrides?.teams?.allowFortifyThroughTeammates ?? true);
    setTeamCountDraft(lobby.game.teamCount ?? 2);
    setTeamNameDrafts((lobby.game.teamNames as Record<string, string> | null) ?? {});
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
  const teamCount = lobby.game.teamCount ?? 2;
  const teamIds = teamModeEnabled
    ? Array.from({ length: teamCount }, (_, index) => `team-${index + 1}`)
    : [];
  const teamNames = (lobby.game.teamNames as Record<string, string> | null) ?? {};
  const teamLabel = (teamId: string) => teamNames[teamId] ?? teamNameDrafts[teamId] ?? teamId;
  const teamSizes = Object.fromEntries(
    teamIds.map((teamId) => [teamId, lobby.players.filter((player) => player.teamId === teamId).length]),
  );
  const playersMissingTeam = lobby.players.filter((player) => !player.teamId).length;
  const minTeamSize = teamIds.length > 0 ? Math.min(...teamIds.map((teamId) => teamSizes[teamId] ?? 0)) : 0;
  const maxTeamSize = teamIds.length > 0 ? Math.max(...teamIds.map((teamId) => teamSizes[teamId] ?? 0)) : 0;
  const nonDivisibleWarning = teamModeEnabled && lobby.players.length > 0 && (lobby.players.length % teamCount !== 0);
  const teamSetupValid = !teamModeEnabled || (
    playersMissingTeam === 0 &&
    teamIds.every((teamId) => (teamSizes[teamId] ?? 0) > 0) &&
    maxTeamSize - minTeamSize <= 1
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

  async function handleTeamChange(targetUserId: string, teamId: string) {
    if (!gameId) return;
    try {
      await setPlayerTeam({ gameId: gameId as Id<"games">, userId: targetUserId, teamId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set team");
    }
  }

  async function handleTeamCountChange(nextTeamCount: number) {
    if (!gameId) return;
    setSavingTeams(true);
    setError(null);
    setTeamCountDraft(nextTeamCount);
    try {
      await setTeamCountMutation({
        gameId: gameId as Id<"games">,
        teamCount: nextTeamCount,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set team count");
    } finally {
      setSavingTeams(false);
    }
  }

  async function handleTeamNameBlur(teamId: string) {
    if (!gameId || !isHost) return;
    const draft = teamNameDrafts[teamId];
    if (!draft) return;

    setSavingTeams(true);
    setError(null);
    try {
      await setTeamNameMutation({
        gameId: gameId as Id<"games">,
        teamId,
        name: draft,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set team name");
    } finally {
      setSavingTeams(false);
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

  async function handleColorChange(targetUserId: string, color: string) {
    if (!gameId) return;
    setError(null);
    setPendingColorByUserId((prev) => ({ ...prev, [targetUserId]: color }));
    try {
      await setPlayerColor({
        gameId: gameId as Id<"games">,
        userId: targetUserId,
        color,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set player color");
    } finally {
      setPendingColorByUserId((prev) => {
        const next = { ...prev };
        delete next[targetUserId];
        return next;
      });
    }
  }

  async function handleSaveRules() {
    if (!gameId) return;
    setError(null);
    setSavingRules(true);
    try {
      const rulesetOverrides: RulesetOverridesInput = {
        fortify: {
          fortifyMode,
          ...(maxFortifiesPerTurn === "unlimited" ? {} : { maxFortifiesPerTurn }),
        },
        cards: {
          forcedTradeHandSize,
          tradeValues: [...CARD_INCREMENT_PRESETS[cardIncrementPreset].tradeValues],
          tradeValueOverflow: CARD_INCREMENT_PRESETS[cardIncrementPreset].tradeValueOverflow,
        },
        teams: {
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
                      <span className="size-3 rounded-full border border-white/40" style={{ backgroundColor: pendingColorByUserId[player.userId] ?? player.color }} />
                      <UserRoundPlus className="size-4 text-primary" />
                      <span className="font-medium">{player.displayName}</span>
                      {player.role === "host" && <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-xs text-primary">Host</span>}
                      {player.userId === userId && <span className="text-xs text-muted-foreground">(you)</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {canEditLobbyPlayerColor(isHost, userId, player.userId) ? (
                        <select
                          value={pendingColorByUserId[player.userId] ?? player.color}
                          onChange={(event) => {
                            void handleColorChange(player.userId, event.target.value);
                          }}
                          disabled={Boolean(pendingColorByUserId[player.userId])}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          {getLobbyColorOptions(lobby.players, player.userId, pendingColorByUserId).map((option) => (
                            <option key={option.color} value={option.color} disabled={option.disabled}>
                              {option.color}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{player.color}</span>
                      )}
                      {teamModeEnabled && (
                        isHost ? (
                          <select
                            value={player.teamId ?? ""}
                            onChange={(event) => {
                              const teamId = event.target.value;
                              if (teamId) void handleTeamChange(player.userId, teamId);
                            }}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value="">No team</option>
                            {teamIds.map((teamId) => (
                              <option key={teamId} value={teamId}>{teamLabel(teamId)}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                            {player.teamId ? teamLabel(player.teamId) : "No team"}
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
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-muted-foreground">
                    Team count
                    <select
                      value={teamCountDraft}
                      disabled={!isHost || savingTeams}
                      onChange={(event) => {
                        void handleTeamCountChange(Number(event.target.value));
                      }}
                      className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {Array.from({ length: Math.max(1, lobby.players.length - 1) }, (_, index) => index + 2).map((count) => (
                        <option key={count} value={count}>{count} teams</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {teamIds.map((teamId) => (
                    <label key={teamId} className="text-xs text-muted-foreground">
                      {teamId}
                      <input
                        type="text"
                        value={teamNameDrafts[teamId] ?? teamLabel(teamId)}
                        disabled={!isHost || savingTeams}
                        onChange={(event) => {
                          const value = event.target.value;
                          setTeamNameDrafts((prev) => ({ ...prev, [teamId]: value }));
                        }}
                        onBlur={() => {
                          void handleTeamNameBlur(teamId);
                        }}
                        className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {teamIds.map((teamId) => `${teamLabel(teamId)}: ${teamSizes[teamId] ?? 0}`).join(" | ")} | Unassigned: {playersMissingTeam}
                </p>
                {nonDivisibleWarning && (
                  <p className="text-sm text-amber-600">
                    Team count does not evenly divide player count. This is allowed but not ideal for balance.
                  </p>
                )}
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
                <label className="text-xs text-muted-foreground">
                  Card reward increment
                  <select
                    value={cardIncrementPreset}
                    onChange={(event) => setCardIncrementPreset(event.target.value as keyof typeof CARD_INCREMENT_PRESETS)}
                    disabled={!isHost}
                    className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {(Object.entries(CARD_INCREMENT_PRESETS) as Array<
                      [keyof typeof CARD_INCREMENT_PRESETS, (typeof CARD_INCREMENT_PRESETS)[keyof typeof CARD_INCREMENT_PRESETS]]
                    >).map(([key, preset]) => (
                      <option key={key} value={key}>{preset.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {teamModeEnabled && (
                <>
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
