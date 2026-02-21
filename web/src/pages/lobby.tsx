import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Copy, Play, Shuffle, Trash2, UserRoundPlus, Users, X } from "lucide-react";
import { PLAYER_COLOR_NAME_BY_HEX } from "risk-engine";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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

const FORTIFY_MODE_OPTIONS = [
  { value: "connected", label: "Connected" },
  { value: "adjacent", label: "Adjacent" },
] as const;

const MAX_FORTIFY_OPTIONS = [
  { value: "unlimited", label: "Unlimited" },
  { value: "0", label: "0" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
] as const;

function RulesSwitch({
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 border border-border/75 bg-background/65 px-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </label>
  );
}

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

function PlayerColorPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: ReturnType<typeof getLobbyColorOptions>;
  onChange: (nextColor: string) => void;
}) {
  const activeOption = options.find((option) => option.color === value);
  const activeLabel = activeOption?.name ?? value;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 min-w-[136px] justify-start gap-2 text-xs">
          <span className="size-3 rounded-full border border-white/40" style={{ backgroundColor: value }} />
          <span className="truncate">{activeLabel}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52">
        <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Player Color</p>
        <div className="grid grid-cols-5 gap-1.5">
          {options.map((option) => {
            const selected = option.color === value;
            return (
              <button
                key={option.color}
                type="button"
                title={option.name}
                disabled={option.disabled}
                onClick={() => onChange(option.color)}
                className={`relative size-7 overflow-hidden border transition ${
                  selected ? "border-primary ring-2 ring-primary/35" : "border-white/35"
                } ${option.disabled ? "cursor-not-allowed" : ""}`}
                style={{ backgroundColor: option.color }}
              >
                <span className="sr-only">{option.name}</span>
                {option.disabled ? (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/35" aria-hidden="true">
                    <X className="size-4 text-white" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function LobbyPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const lobby = useQuery(api.lobby.getLobby, gameId ? { gameId: gameId as Id<"games"> } : "skip");
  const kickPlayer = useMutation(api.lobby.kickPlayer);
  const startGame = useMutation(api.lobby.startGame);
  const setPlayerTeam = useMutation(api.lobby.setPlayerTeam);
  const rebalanceTeams = useMutation(api.lobby.rebalanceTeams);
  const reassignPlayerColors = useMutation(api.lobby.reassignPlayerColors);
  const setTeamCountMutation = useMutation(api.lobby.setTeamCount);
  const setTeamNameMutation = useMutation(api.lobby.setTeamName);
  const setRulesetOverrides = useMutation(api.lobby.setRulesetOverrides);
  const setPlayerColor = useMutation(api.lobby.setPlayerColor);
  const joinGameByInvite = useMutation(api.lobby.joinGameByInvite);
  const deleteGame = useMutation(api.lobby.deleteGame);

  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deletingGame, setDeletingGame] = useState(false);
  const [joining, setJoining] = useState(false);
  const [rebalancing, setRebalancing] = useState(false);
  const [reassigningColors, setReassigningColors] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [savingTeams, setSavingTeams] = useState(false);
  const [fortifyMode, setFortifyMode] = useState<"adjacent" | "connected">("connected");
  const [maxFortifiesPerTurn, setMaxFortifiesPerTurn] = useState<number | "unlimited">(3);
  const [forcedTradeHandSize, setForcedTradeHandSize] = useState(5);
  const [cardIncrementPreset, setCardIncrementPreset] = useState<keyof typeof CARD_INCREMENT_PRESETS>("classic");
  const [allowPlaceOnTeammate, setAllowPlaceOnTeammate] = useState(true);
  const [allowFortifyWithTeammate, setAllowFortifyWithTeammate] = useState(true);
  const [allowFortifyThroughTeammates, setAllowFortifyThroughTeammates] = useState(true);
  const [teamCountDraft, setTeamCountDraft] = useState(2);
  const [teamNameDrafts, setTeamNameDrafts] = useState<Record<string, string>>({});
  const [pendingColorByUserId, setPendingColorByUserId] = useState<Record<string, string>>({});
  const colorRequestSeqByUserIdRef = useRef<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lobby) return;
    const overrides = lobby.game.rulesetOverrides as Partial<RulesetOverridesInput> | null;
    const nextFortifyMode = overrides?.fortify?.fortifyMode ?? "connected";
    setFortifyMode(nextFortifyMode);
    setMaxFortifiesPerTurn(
      overrides?.fortify?.maxFortifiesPerTurn === undefined
        ? 3
        : overrides.fortify.maxFortifiesPerTurn,
    );
    setForcedTradeHandSize(overrides?.cards?.forcedTradeHandSize ?? 5);
    setCardIncrementPreset(
      resolveCardPresetKey(overrides?.cards?.tradeValues, overrides?.cards?.tradeValueOverflow),
    );
    setAllowPlaceOnTeammate(overrides?.teams?.allowPlaceOnTeammate ?? true);
    setAllowFortifyWithTeammate(overrides?.teams?.allowFortifyWithTeammate ?? true);
    setAllowFortifyThroughTeammates(
      nextFortifyMode === "connected" && (overrides?.teams?.allowFortifyThroughTeammates ?? true),
    );
    setTeamCountDraft(lobby.game.teamCount ?? 2);
    setTeamNameDrafts((lobby.game.teamNames as Record<string, string> | null) ?? {});
  }, [lobby]);

  if (sessionPending) {
    return <div className="page-shell flex items-center justify-center">Loading...</div>;
  }

  if (!session) {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
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
  const isInGame = lobby.players.some((player) => player.userId === userId);
  const isHost = lobby.game.createdBy === userId;
  const teamModeEnabled = lobby.game.teamModeEnabled;
  const timingMode = (lobby.game as { timingMode?: "realtime" | "async_1d" | "async_3d" }).timingMode ?? "realtime";
  const excludeWeekends = (lobby.game as { excludeWeekends?: boolean }).excludeWeekends ?? false;
  const turnDeadlineAt = (lobby.game as { turnDeadlineAt?: number | null }).turnDeadlineAt ?? null;
  const inviteUrl = lobby.inviteCode ? `${window.location.origin}/join/${lobby.inviteCode}` : null;
  const teamCount = lobby.game.teamCount ?? 2;
  const teamIds = teamModeEnabled
    ? Array.from({ length: teamCount }, (_, index) => `team-${index + 1}`)
    : [];
  const teamNames = (lobby.game.teamNames as Record<string, string> | null) ?? {};
  const defaultTeamLabelById = Object.fromEntries(
    teamIds.map((teamId, index) => [teamId, `Team ${index + 1}`]),
  );
  const teamLabel = (teamId: string) =>
    teamNames[teamId] ?? teamNameDrafts[teamId] ?? defaultTeamLabelById[teamId] ?? teamId;
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
  const lobbyIsFull = lobby.players.length >= lobby.game.maxPlayers;

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

  async function handleJoinLobby() {
    const inviteCode = lobby?.inviteCode;
    if (!inviteCode || isInGame) return;
    setError(null);
    setJoining(true);
    try {
      await joinGameByInvite({ code: inviteCode });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join lobby");
    } finally {
      setJoining(false);
    }
  }

  async function handleDeleteGame() {
    if (!gameId || !isHost || deletingGame) return;
    const confirmed = window.confirm("Delete this game lobby? This cannot be undone.");
    if (!confirmed) return;

    setError(null);
    setDeletingGame(true);
    try {
      await deleteGame({ gameId: gameId as Id<"games"> });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete game");
    } finally {
      setDeletingGame(false);
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

  async function handleReassignColors() {
    if (!gameId) return;
    setError(null);
    setReassigningColors(true);
    try {
      await reassignPlayerColors({ gameId: gameId as Id<"games"> });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reassign colors");
    } finally {
      setReassigningColors(false);
    }
  }

  async function handleColorChange(targetUserId: string, color: string) {
    if (!gameId) return;
    setError(null);
    const nextSeq = (colorRequestSeqByUserIdRef.current[targetUserId] ?? 0) + 1;
    colorRequestSeqByUserIdRef.current[targetUserId] = nextSeq;
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
        if (colorRequestSeqByUserIdRef.current[targetUserId] !== nextSeq) {
          return prev;
        }
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
            <div className="flex items-start gap-3">
              <Button
                variant="outline"
                size="sm"
                title="Back to home"
                aria-label="Back to home"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <div className="min-w-0">
                <CardTitle className="hero-title">{lobby.game.name}</CardTitle>
                <p className="text-sm text-muted-foreground">Waiting for players ({lobby.players.length}/{lobby.game.maxPlayers})</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 pb-6">
            {error && <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            {inviteUrl && (
              <div className="space-y-2 rounded-lg border bg-background/75 p-3">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Invite</p>
                <div className="flex gap-2">
                  <code className="flex-1 truncate rounded-md border bg-muted/60 px-3 py-2 text-sm">{inviteUrl}</code>
                  <Button type="button" variant="outline" onClick={copyInvite} className="w-24">
                    <Copy className="size-4" />
                    <span className="inline-block text-center">{copied ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Code: <span className="font-mono font-semibold">{lobby.inviteCode}</span></p>
              </div>
            )}

            <div className="space-y-1 rounded-lg border bg-background/75 p-3">
              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Turn Timing</p>
              <p className="text-sm text-foreground">
                {timingMode === "realtime"
                  ? "Realtime (no turn timer)"
                  : timingMode === "async_1d"
                    ? "Async (1 day per turn)"
                    : "Async (3 days per turn)"}
              </p>
              {timingMode !== "realtime" && (
                <p className="text-xs text-muted-foreground">
                  Weekends {excludeWeekends ? "excluded" : "included"} in timer calculations.
                </p>
              )}
              {turnDeadlineAt && (
                <p className="text-xs text-muted-foreground">
                  Current deadline: {new Date(turnDeadlineAt).toLocaleString()} ({new Date(turnDeadlineAt).toUTCString()})
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Players</p>
              <div className="space-y-2">
                {lobby.players.map((player) => (
                  <div key={player.userId} className="space-y-2 rounded-lg border bg-background/75 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="size-3 rounded-full border border-white/40" style={{ backgroundColor: pendingColorByUserId[player.userId] ?? player.color }} />
                        <UserRoundPlus className="size-4 text-primary" />
                        <span className="truncate font-medium">{player.displayName}</span>
                        {player.role === "host" && <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-xs text-primary">Host</span>}
                        {player.userId === userId && <span className="text-xs text-muted-foreground">(you)</span>}
                      </div>
                      {isHost && player.role !== "host" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleKick(player.userId)}
                          className="w-20 text-destructive hover:text-destructive"
                        >
                          <X className="size-4" />
                          Kick
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pl-5">
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Color</p>
                        {canEditLobbyPlayerColor(isHost, userId, player.userId) ? (
                          <PlayerColorPicker
                            value={pendingColorByUserId[player.userId] ?? player.color}
                            options={getLobbyColorOptions(lobby.players, player.userId, pendingColorByUserId)}
                            onChange={(value) => {
                              void handleColorChange(player.userId, value);
                            }}
                          />
                        ) : (
                          <span className="inline-flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                            <span className="size-3 rounded-full border border-white/40" style={{ backgroundColor: player.color }} />
                            {PLAYER_COLOR_NAME_BY_HEX[player.color as keyof typeof PLAYER_COLOR_NAME_BY_HEX] ?? player.color}
                          </span>
                        )}
                      </div>
                      {teamModeEnabled && (
                        <div className="min-w-[220px] flex-1 space-y-1">
                          <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Team</p>
                          {isHost ? (
                            <Select
                              value={player.teamId ?? undefined}
                              onValueChange={(value) => {
                                void handleTeamChange(player.userId, value);
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Assign team" />
                              </SelectTrigger>
                              <SelectContent>
                                {teamIds.map((teamId) => (
                                  <SelectItem key={teamId} value={teamId}>
                                    {teamLabel(teamId)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="inline-flex rounded-md border bg-muted px-2 py-1 text-xs text-muted-foreground">
                              {player.teamId ? teamLabel(player.teamId) : "No team"}
                            </span>
                          )}
                        </div>
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
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleReassignColors} disabled={reassigningColors}>
                        {reassigningColors ? "Reassigning..." : "Reassign colors"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleRebalance} disabled={rebalancing}>
                        <Shuffle className="size-4" />
                        {rebalancing ? "Rebalancing..." : "Auto rebalance"}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-[140px] space-y-1">
                    <p className="text-xs text-muted-foreground">Team count</p>
                    <Select
                      value={String(teamCountDraft)}
                      disabled={!isHost || savingTeams}
                      onValueChange={(value) => {
                        void handleTeamCountChange(Number(value));
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: Math.max(1, lobby.players.length - 1) }, (_, index) => index + 2).map((count) => (
                          <SelectItem key={count} value={String(count)}>
                            {count} teams
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex min-h-8 flex-wrap items-center gap-2">
                    <span className="inline-flex border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                      Players: {lobby.players.length}
                    </span>
                    <span className="inline-flex border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                      Unassigned: {playersMissingTeam}
                    </span>
                    <span className="inline-flex border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                      Balance: {maxTeamSize - minTeamSize}
                    </span>
                  </div>
                </div>
                <div className="grid gap-2">
                  {teamIds.map((teamId) => (
                    <div key={teamId} className="flex items-center gap-2">
                      <Input
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
                        className="h-8 text-xs"
                      />
                      <span className="inline-flex min-w-20 whitespace-nowrap justify-center border border-border/70 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                        {teamSizes[teamId] ?? 0} players
                      </span>
                    </div>
                  ))}
                </div>
                {nonDivisibleWarning && <p className="text-xs text-amber-600">Player count does not divide evenly across teams.</p>}
                {!teamSetupValid && (
                  <p className="text-xs text-destructive">
                    Assign every player and keep teams balanced (difference at most 1).
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2 rounded-lg border bg-background/75 p-3">
              <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Game Rules</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Fortify mode</p>
                  <Select
                    value={fortifyMode}
                    onValueChange={(value) => {
                      const nextMode = value as "adjacent" | "connected";
                      setFortifyMode(nextMode);
                      if (nextMode === "adjacent") {
                        setAllowFortifyThroughTeammates(false);
                      }
                    }}
                    disabled={!isHost}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORTIFY_MODE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Fortifies / turn</p>
                  <Select
                    value={String(maxFortifiesPerTurn)}
                    onValueChange={(value) =>
                      setMaxFortifiesPerTurn(value === "unlimited" ? "unlimited" : Number(value))
                    }
                    disabled={!isHost}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MAX_FORTIFY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="text-xs text-muted-foreground">
                  Forced trade hand size
                  <Input
                    type="number"
                    min={3}
                    max={12}
                    value={forcedTradeHandSize}
                    onChange={(event) => setForcedTradeHandSize(Number(event.target.value))}
                    disabled={!isHost}
                    className="mt-1 h-8 text-xs"
                  />
                </label>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Card reward increment</p>
                  <Select
                    value={cardIncrementPreset}
                    onValueChange={(value) => setCardIncrementPreset(value as keyof typeof CARD_INCREMENT_PRESETS)}
                    disabled={!isHost}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(CARD_INCREMENT_PRESETS) as Array<
                        [keyof typeof CARD_INCREMENT_PRESETS, (typeof CARD_INCREMENT_PRESETS)[keyof typeof CARD_INCREMENT_PRESETS]]
                      >).map(([key, preset]) => (
                        <SelectItem key={key} value={key}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {teamModeEnabled && (
                <div className="space-y-2">
                  <RulesSwitch
                    checked={allowPlaceOnTeammate}
                    disabled={!isHost}
                    onCheckedChange={setAllowPlaceOnTeammate}
                    label="Allow place on teammate"
                  />
                  <RulesSwitch
                    checked={allowFortifyWithTeammate}
                    disabled={!isHost}
                    onCheckedChange={setAllowFortifyWithTeammate}
                    label="Allow fortifying teammates"
                  />
                  <RulesSwitch
                    checked={allowFortifyThroughTeammates}
                    disabled={!isHost || fortifyMode === "adjacent"}
                    onCheckedChange={setAllowFortifyThroughTeammates}
                    label="Allow fortify through teammate chain"
                  />
                </div>
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
              {isHost && (
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={deletingGame}
                  onClick={handleDeleteGame}
                >
                  <Trash2 className="size-4" />
                  {deletingGame ? "Deleting..." : "Delete Game"}
                </Button>
              )}
              {!isInGame && (
                <Button
                  className="flex-1"
                  disabled={joining || lobbyIsFull || !lobby.inviteCode}
                  onClick={handleJoinLobby}
                >
                  <UserRoundPlus className="size-4" />
                  {joining ? "Joining..." : lobbyIsFull ? "Lobby Full" : "Join Lobby"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
