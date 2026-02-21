import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "@backend/_generated/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isValidInviteCode, normalizeInviteCode } from "@/lib/invite-codes";

function resolveJoinErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Unable to join this game right now.";
  if (error.message.includes("Invalid invite code")) return "This invite code was not found.";
  if (error.message.includes("Invite code has expired")) return "This invite code has expired.";
  if (error.message.includes("Game is not in lobby")) return "This game is no longer accepting joins.";
  if (error.message.includes("Game not found")) return "This invite is no longer valid.";
  if (error.message.includes("Game is full")) return "This lobby is full.";
  return "Unable to join this game right now.";
}

export default function JoinGamePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const joinGame = useMutation(api.lobby.joinGameByInvite);
  const normalizedCode = normalizeInviteCode(code ?? "");
  const hasValidCode = isValidInviteCode(normalizedCode);

  const [joinFailure, setJoinFailure] = useState<{ code: string; message: string } | null>(null);
  const attemptedCodesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!session || !hasValidCode) return;
    if (attemptedCodesRef.current.has(normalizedCode)) return;
    attemptedCodesRef.current.add(normalizedCode);

    joinGame({ code: normalizedCode })
      .then(({ gameId }) => {
        navigate(`/g/${gameId}`, { replace: true });
      })
      .catch((err: unknown) => {
        setJoinFailure({ code: normalizedCode, message: resolveJoinErrorMessage(err) });
      });
  }, [hasValidCode, joinGame, navigate, normalizedCode, session]);

  const error = !hasValidCode
    ? "That invite code format is invalid."
    : joinFailure?.code === normalizedCode
      ? joinFailure.message
      : null;
  const joining = hasValidCode && !error;

  if (sessionPending) {
    return <div className="page-shell flex items-center justify-center">Loading...</div>;
  }

  if (!session) {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
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
