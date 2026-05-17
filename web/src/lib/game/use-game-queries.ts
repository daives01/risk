import { useQuery } from "convex/react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { useReplayWindows } from "@/lib/game/use-replay-windows";
import type { ChatMessage } from "@/lib/game/types";

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
  const replayWindows = useReplayWindows(typedGameId, historyEnabled);

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
    ...replayWindows,
    chatMessages,
  };
}
