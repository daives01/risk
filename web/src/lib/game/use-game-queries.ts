import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { reconstructHistoryWindow } from "@/lib/game/history-timeline";
import type { ChatMessage, GameAction, HistoryWindow } from "@/lib/game/types";

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

  const historyWindow = useQuery(
    api.gameplay.getHistoryWindow,
    typedGameId && historyEnabled ? { gameId: typedGameId } : "skip",
  ) as HistoryWindow | undefined;

  const historyTimeline = useMemo(
    () => reconstructHistoryWindow(historyWindow),
    [historyWindow],
  );

  const timelineActions = useMemo(
    () =>
      historyWindow?.actions.map((action) => ({
        _id: action._id,
        index: action.index,
        events: action.events ?? [],
        publicStatePatch: action.publicStatePatch,
      })) satisfies GameAction[] | undefined,
    [historyWindow],
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
