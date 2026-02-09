import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Map } from "lucide-react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
  };
};

type GameTimingMode = "realtime" | "async_1d" | "async_3d";

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
  const createGame = useMutation(api.lobby.createGame);

  const [name, setName] = useState("");
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [teamModeEnabled, setTeamModeEnabled] = useState(false);
  const [teamAssignmentStrategy, setTeamAssignmentStrategy] = useState<"manual" | "balancedRandom">("manual");
  const [timingMode, setTimingMode] = useState<GameTimingMode>("realtime");
  const [excludeWeekends, setExcludeWeekends] = useState(false);
  const [fortifyMode, setFortifyMode] = useState<"adjacent" | "connected">("connected");
  const [maxFortifiesPerTurn, setMaxFortifiesPerTurn] = useState<number | "unlimited">(3);
  const [forcedTradeHandSize, setForcedTradeHandSize] = useState(5);
  const [cardIncrementPreset, setCardIncrementPreset] = useState<keyof typeof CARD_INCREMENT_PRESETS>("classic");
  const [allowPlaceOnTeammate, setAllowPlaceOnTeammate] = useState(true);
  const [allowFortifyWithTeammate, setAllowFortifyWithTeammate] = useState(true);
  const [allowFortifyThroughTeammates, setAllowFortifyThroughTeammates] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const sessionUsername =
    (session?.user as { username?: string | null } | undefined)?.username ?? session?.user.name ?? "";
  const gameNamePlaceholder = sessionUsername ? `${sessionUsername}'s Risk Game` : "Risk Game";
  const selectedMap = useMemo(
    () => maps?.find((map) => map.mapId === selectedMapId) ?? null,
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
          allowFortifyThroughTeammates,
        },
      };
      const { gameId } = await createGame({
        name: trimmedName,
        mapId: selectedMapId,
        maxPlayers,
        teamModeEnabled,
        teamAssignmentStrategy,
        timingMode,
        excludeWeekends,
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
            <div className="mb-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/")}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
            </div>
            <CardTitle className="hero-title">Create a game</CardTitle>
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
                    {maps.map((map) => (
                      <button
                        key={map.mapId}
                        type="button"
                        onClick={() => setSelectedMapId(map.mapId)}
                        className={`rounded-lg border p-3 text-left transition ${
                          selectedMapId === map.mapId
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
                <RulesSwitch
                  label="Exclude weekends from turn timer"
                  checked={excludeWeekends}
                  onCheckedChange={setExcludeWeekends}
                  disabled={timingMode === "realtime"}
                />
                {timingMode === "realtime" && (
                  <p className="text-xs text-muted-foreground">Realtime games do not use turn deadlines.</p>
                )}
              </div>

              <div className="space-y-3 rounded-lg border bg-background/70 p-3">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Game Rules</p>

                <div className="space-y-2">
                  <Label htmlFor="fortifyMode">Fortify Mode</Label>
                  <Select
                    value={fortifyMode}
                    onValueChange={(value) => setFortifyMode(value as "adjacent" | "connected")}
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

                    <RulesSwitch
                      checked={allowPlaceOnTeammate}
                      onCheckedChange={setAllowPlaceOnTeammate}
                      label="Allow placing on teammate"
                    />
                    <RulesSwitch
                      checked={allowFortifyWithTeammate}
                      onCheckedChange={setAllowFortifyWithTeammate}
                      label="Allow fortify with teammate"
                    />
                    <RulesSwitch
                      checked={allowFortifyThroughTeammates}
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
