import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, Map } from "lucide-react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpPopover } from "@/components/ui/help-popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type RulesetOverridesInput = {
  fortify: { fortifyMode: "adjacent" | "connected"; maxFortifiesPerTurn?: number };
  cards: { forcedTradeHandSize: number; tradeValues: number[]; tradeValueOverflow: "repeatLast" | "continueByFive" };
  teams: {
    allowPlaceOnTeammate: boolean;
    allowFortifyWithTeammate: boolean;
    allowFortifyThroughTeammates: boolean;
    continentBonusRecipient: "majorityHolderOnTeam" | "individual";
  };
};

type GameTimingMode = "realtime" | "async_1d" | "async_3d";
type GameVisibility = "public" | "unlisted";
type MapListQuery = FunctionReturnType<typeof api.maps.list>;
type MapListItem = MapListQuery[number];
type SlackWorkspaceListQuery = FunctionReturnType<typeof api.slackAdmin.listMyWorkspaceOptions>;
type SlackWorkspaceListItem = SlackWorkspaceListQuery[number];

const TIMING_MODE_OPTIONS: Array<{ value: GameTimingMode; label: string }> = [
  { value: "realtime", label: "Realtime" },
  { value: "async_1d", label: "Async (1 day / turn)" },
  { value: "async_3d", label: "Async (3 days / turn)" },
];

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
  { value: "connected", label: "Connected path" },
  { value: "adjacent", label: "Adjacent only" },
] as const;

const MAX_FORTIFY_OPTIONS = [
  { value: "unlimited", label: "Unlimited" },
  { value: "0", label: "0" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
] as const;

const TEAM_ASSIGNMENT_OPTIONS = [
  { value: "manual", label: "Manual in lobby" },
  { value: "balancedRandom", label: "Balanced random" },
] as const;

const TEAM_CONTINENT_REWARD_OPTIONS = [
  { value: "majorityHolderOnTeam", label: "Team majority holder" },
  { value: "individual", label: "Individual only" },
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

export default function CreateGamePage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const maps = useQuery(api.maps.list);
  const slackWorkspaceOptions = useQuery(
    api.slackAdmin.listMyWorkspaceOptions,
    session ? {} : "skip",
  );
  const createGame = useMutation(api.lobby.createGame);

  const [name, setName] = useState("");
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [teamModeEnabled, setTeamModeEnabled] = useState(false);
  const [visibility, setVisibility] = useState<GameVisibility>("public");
  const [teamAssignmentStrategy, setTeamAssignmentStrategy] = useState<"manual" | "balancedRandom">("balancedRandom");
  const [timingMode, setTimingMode] = useState<GameTimingMode>("realtime");
  const [excludeWeekends, setExcludeWeekends] = useState(false);
  const [slackNotificationsEnabled, setSlackNotificationsEnabled] = useState(false);
  const [slackTeamId, setSlackTeamId] = useState<string | null>(null);
  const [fortifyMode, setFortifyMode] = useState<"adjacent" | "connected">("connected");
  const [maxFortifiesPerTurn, setMaxFortifiesPerTurn] = useState<number | "unlimited">(1);
  const [forcedTradeHandSize, setForcedTradeHandSize] = useState(5);
  const [cardIncrementPreset, setCardIncrementPreset] = useState<keyof typeof CARD_INCREMENT_PRESETS>("classic");
  const [allowPlaceOnTeammate, setAllowPlaceOnTeammate] = useState(true);
  const [allowFortifyWithTeammate, setAllowFortifyWithTeammate] = useState(true);
  const [allowFortifyThroughTeammates, setAllowFortifyThroughTeammates] = useState(true);
  const [continentBonusRecipient, setContinentBonusRecipient] = useState<"majorityHolderOnTeam" | "individual">("majorityHolderOnTeam");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sessionUsername =
    (session?.user as { username?: string | null } | undefined)?.username ?? session?.user.name ?? "";
  const gameNamePlaceholder = sessionUsername ? `${sessionUsername}'s Risk Game` : "Risk Game";
  const selectedMap = useMemo(
    () => maps?.find((map: MapListItem) => map.mapId === selectedMapId) ?? null,
    [maps, selectedMapId],
  );
  const allowedPlayerCounts = useMemo(() => {
    const min = selectedMap?.playerLimits.minPlayers ?? 2;
    const max = selectedMap?.playerLimits.maxPlayers ?? 6;
    if (max < min) return [];
    return Array.from({ length: max - min + 1 }, (_, index) => min + index);
  }, [selectedMap]);

  useEffect(() => {
    if (name || !gameNamePlaceholder) return;
    setName(gameNamePlaceholder);
  }, [gameNamePlaceholder, name]);

  useEffect(() => {
    if (allowedPlayerCounts.length === 0) return;
    const highestAllowed = allowedPlayerCounts[allowedPlayerCounts.length - 1]!;
    if (!allowedPlayerCounts.includes(maxPlayers)) {
      setMaxPlayers(highestAllowed);
    }
  }, [allowedPlayerCounts, maxPlayers]);

  useEffect(() => {
    if (!maps || maps.length !== 1 || selectedMapId) return;
    setSelectedMapId(maps[0]!.mapId);
  }, [maps, selectedMapId]);

  if (sessionPending) {
    return <div className="page-shell flex items-center justify-center">Loading...</div>;
  }

  if (!session) {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter a game name");
      return;
    }
    if (!selectedMapId) {
      setError("Please select a map");
      return;
    }
    if (slackNotificationsEnabled && !slackTeamId) {
      setError("Select a Slack workspace or disable Slack notifications");
      return;
    }

    setError(null);
    setLoading(true);
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
          allowFortifyThroughTeammates: fortifyMode === "connected" && allowFortifyThroughTeammates,
          continentBonusRecipient,
        },
      };
      const { gameId } = await createGame({
        name: trimmedName,
        mapId: selectedMapId,
        visibility,
        maxPlayers,
        teamModeEnabled,
        teamAssignmentStrategy,
        timingMode,
        excludeWeekends,
        slackNotificationsEnabled,
        ...(slackNotificationsEnabled && slackTeamId ? { slackTeamId } : {}),
        rulesetOverrides,
      });
      navigate(`/g/${gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-shell soft-grid">
      <div className="page-container mx-auto max-w-3xl">
        <Card className="glass-panel border-0 py-0">
          <CardHeader className="py-6">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                title="Back to home"
                aria-label="Back to home"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="size-4" />
              </Button>
              <CardTitle className="hero-title">Create a game</CardTitle>
            </div>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5">
              {error && <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
              <div className="space-y-2">
                <Label htmlFor="name">Game Name</Label>
                <Input
                  id="name"
                  placeholder={gameNamePlaceholder}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Map</Label>
                {maps === undefined && <p className="text-sm text-muted-foreground">Loading maps...</p>}
                {maps !== undefined && maps.length === 0 && (
                  <p className="text-sm text-muted-foreground">No maps available.</p>
                )}
                {maps && maps.length > 0 && (
                  <div className="grid gap-2">
                    {maps.map((map: MapListItem) => (
                      <button
                        key={map.mapId}
                        type="button"
                        onClick={() => setSelectedMapId(map.mapId)}
                        className={`rounded-lg border p-3 text-left transition ${selectedMapId === map.mapId
                          ? "border-primary bg-primary/12"
                          : "bg-background/70 hover:border-primary/45"
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{map.name}</span>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Map className="size-3.5" />
                            {Object.keys(map.graphMap.territories).length} territories
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {map.playerLimits.minPlayers}-{map.playerLimits.maxPlayers} players
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxPlayers">Max Players</Label>
                <Select value={String(maxPlayers)} onValueChange={(value) => setMaxPlayers(Number(value))}>
                  <SelectTrigger id="maxPlayers">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedPlayerCounts.map((numPlayers) => (
                      <SelectItem key={numPlayers} value={String(numPlayers)}>
                        {numPlayers} players
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <RulesSwitch
                checked={visibility === "unlisted"}
                onCheckedChange={(checked) => setVisibility(checked ? "unlisted" : "public")}
                label="Require invite code to join"
              />
              <p className="text-xs text-muted-foreground">
                {visibility === "public"
                  ? "Anyone can see and join this game."
                  : "Only people you send the code to can join this game."}
              </p>

              <div className="space-y-3 rounded-lg border bg-background/70 p-3">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Turn Timing</p>
                <div className="space-y-2">
                  <Label htmlFor="timingMode">Game Mode</Label>
                  <Select
                    value={timingMode}
                    onValueChange={(value) => setTimingMode(value as GameTimingMode)}
                  >
                    <SelectTrigger id="timingMode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMING_MODE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {timingMode !== "realtime" && (
                  <RulesSwitch
                    label="Exclude weekends from turn timer"
                    checked={excludeWeekends}
                    onCheckedChange={setExcludeWeekends}
                  />
                )}
                {timingMode === "realtime" && (
                  <p className="text-xs text-muted-foreground">Realtime games have no turn deadlines.</p>
                )}
                {slackWorkspaceOptions && slackWorkspaceOptions.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <label className="flex items-center justify-between gap-3 border border-border/75 bg-background/65 px-3 py-2">
                      <span className="text-sm text-foreground">Slack turn notifications</span>
                      <Switch
                        checked={slackNotificationsEnabled}
                        onCheckedChange={(checked) => {
                          setSlackNotificationsEnabled(checked);
                          if (!checked) setSlackTeamId(null);
                        }}
                      />
                    </label>
                    {slackNotificationsEnabled && (
                      <div className="space-y-2">
                        <Label htmlFor="slackTeamId">Slack Workspace</Label>
                        <Select
                          value={slackTeamId ?? undefined}
                          onValueChange={(value) => setSlackTeamId(value)}
                        >
                          <SelectTrigger id="slackTeamId">
                            <SelectValue placeholder="Select workspace" />
                          </SelectTrigger>
                          <SelectContent>
                            {(slackWorkspaceOptions ?? []).map((workspace: SlackWorkspaceListItem) => (
                              <SelectItem key={workspace.teamId} value={workspace.teamId}>
                                {workspace.teamName} ({workspace.defaultChannelId})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-lg border bg-background/70 p-3">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Game Rules</p>

                <div className="space-y-2">
                  <Label htmlFor="fortifyMode">Fortify Mode</Label>
                  <Select
                    value={fortifyMode}
                    onValueChange={(value) => {
                      const nextMode = value as "adjacent" | "connected";
                      setFortifyMode(nextMode);
                      if (nextMode === "adjacent") {
                        setAllowFortifyThroughTeammates(false);
                      }
                    }}
                  >
                    <SelectTrigger id="fortifyMode">
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

                <div className="space-y-2">
                  <Label htmlFor="maxFortifiesPerTurn">Fortifies Per Turn</Label>
                  <Select
                    value={String(maxFortifiesPerTurn)}
                    onValueChange={(value) =>
                      setMaxFortifiesPerTurn(value === "unlimited" ? "unlimited" : Number(value))
                    }
                  >
                    <SelectTrigger id="maxFortifiesPerTurn">
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

                <div className="space-y-2">
                  <Label htmlFor="forcedTradeHandSize">Forced Trade Hand Size</Label>
                  <Input
                    id="forcedTradeHandSize"
                    type="number"
                    min={3}
                    max={12}
                    value={forcedTradeHandSize}
                    onChange={(event) => setForcedTradeHandSize(Number(event.target.value))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cardIncrementPreset">Card Reward Increment</Label>
                  <Select
                    value={cardIncrementPreset}
                    onValueChange={(value) =>
                      setCardIncrementPreset(value as keyof typeof CARD_INCREMENT_PRESETS)
                    }
                  >
                    <SelectTrigger id="cardIncrementPreset">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(CARD_INCREMENT_PRESETS) as Array<[keyof typeof CARD_INCREMENT_PRESETS, (typeof CARD_INCREMENT_PRESETS)[keyof typeof CARD_INCREMENT_PRESETS]]>).map(([key, preset]) => (
                        <SelectItem key={key} value={key}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <RulesSwitch
                  checked={teamModeEnabled}
                  onCheckedChange={setTeamModeEnabled}
                  label="Enable team mode"
                />

                {teamModeEnabled && (
                  <div className="space-y-2 rounded-md border border-border/70 bg-background/60 p-3">
                    <Label htmlFor="teamAssignmentStrategy">Team Assignment</Label>
                    <Select
                      value={teamAssignmentStrategy}
                      onValueChange={(value) =>
                        setTeamAssignmentStrategy(value as "manual" | "balancedRandom")
                      }
                    >
                      <SelectTrigger id="teamAssignmentStrategy">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEAM_ASSIGNMENT_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="continentBonusRecipient">Team Continent Reward</Label>
                        <HelpPopover
                          ariaLabel="Explain team continent reward options"
                          className="w-80 space-y-2 p-3"
                          content={(
                            <>
                              <p className="font-medium text-foreground">Continent reward options</p>
                              <p className="text-muted-foreground">
                                <strong className="text-foreground">Team majority holder:</strong> If your team fully controls a continent, only one teammate gets the full bonus. The teammate with the most territories in that continent wins; ties go to the teammate earlier in turn order.
                              </p>
                              <p className="text-muted-foreground">
                                <strong className="text-foreground">Individual only:</strong> Continent bonuses are personal, you have to hold every territory in a continent to get the bonus.
                              </p>
                            </>
                          )}
                        />
                      </div>
                      <Select
                        value={continentBonusRecipient}
                        onValueChange={(value) =>
                          setContinentBonusRecipient(value as "majorityHolderOnTeam" | "individual")
                        }
                      >
                        <SelectTrigger id="continentBonusRecipient">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TEAM_CONTINENT_REWARD_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <RulesSwitch
                      checked={allowPlaceOnTeammate}
                      onCheckedChange={setAllowPlaceOnTeammate}
                      label="Allow placing on teammate"
                    />
                    <RulesSwitch
                      checked={allowFortifyWithTeammate}
                      onCheckedChange={setAllowFortifyWithTeammate}
                      label="Allow fortifying teammates"
                    />
                    <RulesSwitch
                      checked={allowFortifyThroughTeammates}
                      disabled={fortifyMode === "adjacent"}
                      onCheckedChange={setAllowFortifyThroughTeammates}
                      label="Allow fortify through teammate chain"
                    />
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 py-6">
              <Button type="submit" className="w-full" disabled={loading || !selectedMapId || !name.trim()}>
                {loading ? "Creating..." : "Create Game"}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => navigate("/")}>
                Cancel
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
