import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { Copy, Play, UserRoundPlus, X } from "lucide-react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LobbyPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const lobby = useQuery(api.lobby.getLobby, gameId ? { gameId: gameId as Id<"games"> } : "skip");
  const kickPlayer = useMutation(api.lobby.kickPlayer);
  const startGame = useMutation(api.lobby.startGame);

  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const inviteUrl = lobby.inviteCode ? `${window.location.origin}/join/${lobby.inviteCode}` : null;

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
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {isHost && (
                <Button className="flex-1" disabled={starting || lobby.players.length < 2} onClick={handleStart}>
                  <Play className="size-4" />
                  {starting ? "Starting..." : lobby.players.length < 2 ? "Need 2+ players" : "Start Game"}
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
