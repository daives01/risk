import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function CreateGamePage() {
  const { data: session, isPending: sessionPending } =
    authClient.useSession();
  const navigate = useNavigate();
  const maps = useQuery(api.maps.list);
  const createGame = useMutation(api.lobby.createGame);

  const [name, setName] = useState("");
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (sessionPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      });
      navigate(`/g/${gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Create Game</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-4">
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Game Name</Label>
              <Input
                id="name"
                placeholder="My Risk Game"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Map</Label>
              {maps === undefined ? (
                <p className="text-sm text-muted-foreground">Loading maps...</p>
              ) : maps.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No maps available. Seed the database first.
                </p>
              ) : (
                <div className="grid gap-2">
                  {maps.map((m) => (
                    <button
                      key={m.mapId}
                      type="button"
                      onClick={() => setSelectedMapId(m.mapId)}
                      className={`rounded-md border p-3 text-left text-sm transition-colors ${
                        selectedMapId === m.mapId
                          ? "border-primary bg-primary/10"
                          : "hover:bg-accent"
                      }`}
                    >
                      <span className="font-medium">{m.name}</span>
                      <span className="ml-2 text-muted-foreground">
                        {Object.keys(m.graphMap.territories).length} territories
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="maxPlayers">Max Players</Label>
              <select
                id="maxPlayers"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} players
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !selectedMapId}
            >
              {loading ? "Creating..." : "Create Game"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/")}
            >
              Cancel
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
