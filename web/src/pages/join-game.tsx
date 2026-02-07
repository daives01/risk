import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function JoinGamePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = authClient.useSession();

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
        setError(err instanceof Error ? err.message : "Failed to join game");
      })
      .finally(() => setJoining(false));
  }, [attempted, code, joinGame, navigate, session]);

  if (sessionPending) {
    return <div className="page-shell flex items-center justify-center">Loading...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="page-shell flex items-center justify-center soft-grid">
      <Card className="glass-panel w-full max-w-md border-0 py-0">
        <CardContent className="space-y-4 py-8 text-center">
          {joining && <p className="text-muted-foreground">Joining game...</p>}
          {error && (
            <>
              <p className="rounded-md border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => navigate("/")}>Go home</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
