import { useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LobbyPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } =
    authClient.useSession();

  const lobby = useQuery(
    api.lobby.getLobby,
    gameId ? { gameId: gameId as Id<"games"> } : "skip",
  );
  const kickPlayer = useMutation(api.lobby.kickPlayer);
  const startGame = useMutation(api.lobby.startGame);

  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (lobby === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading lobby...</p>
      </div>
    );
  }

  if (lobby === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Game not found.</p>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => navigate("/")}
            >
              Go home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (lobby.game.status === "active") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardContent className="pt-6 text-center">
            <p className="mb-4">This game has started!</p>
            <Button onClick={() => navigate(`/g/${gameId}`)}>
              Go to game
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const userId = session.user.id;
  const isHost = lobby.game.createdBy === userId;
  const inviteUrl = lobby.inviteCode
    ? `${window.location.origin}/join/${lobby.inviteCode}`
    : null;

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleStart() {
    if (!gameId) return;
    setError(null);
    setStarting(true);
    try {
      await startGame({ gameId: gameId as Id<"games"> });
      // Lobby query will reactively update to show active status
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start game");
    } finally {
      setStarting(false);
    }
  }

  async function handleKick(targetUserId: string) {
    if (!gameId) return;
    try {
      await kickPlayer({
        gameId: gameId as Id<"games">,
        userId: targetUserId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to kick player");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">{lobby.game.name}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Waiting for players... ({lobby.players.length}/
            {lobby.game.maxPlayers})
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Invite link */}
          {inviteUrl && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Invite Link</label>
              <div className="flex gap-2">
                <code className="flex-1 truncate rounded-md border bg-muted px-3 py-2 text-sm">
                  {inviteUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyInvite}
                  className="shrink-0"
                >
                  {copied ? "Copied!" : "Copy"}
                </Button>
              </div>
              {lobby.inviteCode && (
                <p className="text-xs text-muted-foreground">
                  Code: <span className="font-mono font-semibold">{lobby.inviteCode}</span>
                </p>
              )}
            </div>
          )}

          {/* Player list */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              Players
            </label>
            <div className="rounded-md border divide-y">
              {lobby.players.map((p) => (
                <div
                  key={p.userId}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {p.displayName}
                    </span>
                    {p.role === "host" && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                        Host
                      </span>
                    )}
                    {p.userId === userId && (
                      <span className="text-xs text-muted-foreground">
                        (you)
                      </span>
                    )}
                  </div>
                  {isHost && p.role !== "host" && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleKick(p.userId)}
                      className="text-destructive hover:text-destructive"
                    >
                      Kick
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {isHost && (
              <Button
                className="flex-1"
                disabled={starting || lobby.players.length < 2}
                onClick={handleStart}
              >
                {starting
                  ? "Starting..."
                  : lobby.players.length < 2
                    ? "Need 2+ players"
                    : "Start Game"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => navigate("/")}
            >
              Leave
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
