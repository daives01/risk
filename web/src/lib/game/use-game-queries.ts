import { useQuery } from "convex/react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import type { GameAction, HistoryFrame } from "@/lib/game/types";

export function useGameViewQueries(session: unknown, typedGameId: Id<"games"> | undefined) {
  const playerView = useQuery(
    api.games.getGameViewAsPlayer,
    session && typedGameId ? { gameId: typedGameId } : "skip",
  );
  const publicView = useQuery(api.games.getGameView, typedGameId ? { gameId: typedGameId } : "skip");

  return {
    playerView,
    publicView,
  };
}

export function useGameRuntimeQueries(typedGameId: Id<"games"> | undefined, mapId?: string) {

  const mapDoc = useQuery(api.maps.getByMapId, mapId ? { mapId } : "skip");

  const recentActions = useQuery(
    api.gameplay.listRecentActions,
    typedGameId ? { gameId: typedGameId, limit: 40 } : "skip",
  ) as GameAction[] | undefined;

  const historyTimeline = useQuery(
    api.gameplay.getHistoryTimeline,
    typedGameId ? { gameId: typedGameId, limit: 500 } : "skip",
  ) as HistoryFrame[] | undefined;

  return {
    mapDoc,
    recentActions,
    historyTimeline,
  };
}
