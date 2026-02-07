import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Map } from "lucide-react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function CreateGamePage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const navigate = useNavigate();

  const maps = useQuery(api.maps.list);
  const createGame = useMutation(api.lobby.createGame);

  const [name, setName] = useState("");
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [teamModeEnabled, setTeamModeEnabled] = useState(false);
  const [teamAssignmentStrategy, setTeamAssignmentStrategy] = useState<"manual" | "balancedRandom">("manual");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
    if (allowedPlayerCounts.length === 0) return;
    const highestAllowed = allowedPlayerCounts[allowedPlayerCounts.length - 1]!;
    if (!allowedPlayerCounts.includes(maxPlayers)) {
      setMaxPlayers(highestAllowed);
    }
  }, [allowedPlayerCounts, maxPlayers]);

  if (sessionPending) {
    return <div className="page-shell flex items-center justify-center">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedMapId) {
      setError("Please select a map");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const { gameId } = await createGame({
        name: name || "New Game",
        mapId: selectedMapId,
        maxPlayers,
        teamModeEnabled,
        teamAssignmentStrategy,
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
                <Input id="name" placeholder="Friday Night Risk" value={name} onChange={(event) => setName(event.target.value)} />
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
                <select
                  id="maxPlayers"
                  value={maxPlayers}
                  onChange={(event) => setMaxPlayers(Number(event.target.value))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  {allowedPlayerCounts.map((numPlayers) => (
                    <option key={numPlayers} value={numPlayers}>
                      {numPlayers} players
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="teamModeEnabled">Team Mode</Label>
                <label className="flex items-center gap-2 rounded-md border bg-background/75 px-3 py-2 text-sm">
                  <input
                    id="teamModeEnabled"
                    type="checkbox"
                    checked={teamModeEnabled}
                    onChange={(event) => setTeamModeEnabled(event.target.checked)}
                  />
                  Enable full team play
                </label>
              </div>

              {teamModeEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="teamAssignmentStrategy">Team Assignment</Label>
                  <select
                    id="teamAssignmentStrategy"
                    value={teamAssignmentStrategy}
                    onChange={(event) => setTeamAssignmentStrategy(event.target.value as "manual" | "balancedRandom")}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="manual">Manual in lobby</option>
                    <option value="balancedRandom">Balanced random</option>
                  </select>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3 py-6">
              <Button type="submit" className="w-full" disabled={loading || !selectedMapId}>
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
