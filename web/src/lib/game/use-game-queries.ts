import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import type { ChatMessage, GameAction, HistoryFrame } from "@/lib/game/types";

export function useGameViewQueries(
  session: unknown,
  sessionPending: boolean,
  typedGameId: Id<"games"> | undefined,
) {
  const playerView = useQuery(
    api.games.getGameViewAsPlayer,
    session && typedGameId ? { gameId: typedGameId } : "skip",
  );
  const publicView = useQuery(
    api.games.getGameView,
    !sessionPending && !session && typedGameId ? { gameId: typedGameId } : "skip",
  );

  return {
    playerView,
    publicView,
  };
}

export function useGameRuntimeQueries(
  typedGameId: Id<"games"> | undefined,
  isAuthenticated: boolean,
  historyEnabled: boolean,
  mapId?: string,
) {
  const mapDoc = useQuery(api.maps.getByMapId, mapId ? { mapId } : "skip");
  const historySummary = useQuery(
    api.gameplay.getHistorySummary,
    typedGameId ? { gameId: typedGameId } : "skip",
  );

  const historyTimeline = useQuery(
    api.gameplay.getHistoryTimeline,
    typedGameId && historyEnabled ? { gameId: typedGameId, limit: 500 } : "skip",
  ) as HistoryFrame[] | undefined;

  const timelineActions = useMemo(
    () =>
      historyTimeline
        ?.filter((frame) => frame.index >= 0)
        .map((frame) => ({
          _id: `${frame.index}`,
          index: frame.index,
          events: frame.events ?? [],
        })) satisfies GameAction[] | undefined,
    [historyTimeline],
  );

  const chatMessages = useQuery(
    api.gameChat.listVisibleMessages,
    typedGameId && isAuthenticated
      ? {
          gameId: typedGameId,
          limit: 60,
        }
      : "skip",
  ) as ChatMessage[] | undefined;

  return {
    mapDoc,
    historySummary,
    historyTimeline,
    timelineActions,
    chatMessages,
  };
}
