import { useEffect, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

export default function JoinGamePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } =
    authClient.useSession();
  const joinGame = useMutation(api.lobby.joinGameByInvite);

  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!session || !code || attempted) return;
    setAttempted(true);
    setJoining(true);

    joinGame({ code })
      .then(({ gameId }) => {
        navigate(`/g/${gameId}`, { replace: true });
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error ? err.message : "Failed to join game";
        // If already in game, redirect to lobby
        if (msg.includes("Already in this game")) {
          // We need the gameId — the error doesn't give it, so show a message
          setError("You're already in this game. Check your games list.");
        } else {
          setError(msg);
        }
      })
      .finally(() => setJoining(false));
  }, [session, code, attempted, joinGame, navigate]);

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

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6 text-center">
          {joining && (
            <p className="text-muted-foreground">Joining game...</p>
          )}
          {error && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => navigate("/")}>
                Go home
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
