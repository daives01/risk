import { useMutation } from "convex/react";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";

export function useGameActions() {
  const submitActionMutation = useMutation(api.gameplay.submitAction);
  const submitReinforcementPlacementsMutation = useMutation(api.gameplay.submitReinforcementPlacements);
  const resignMutation = useMutation(api.gameplay.resign);
  const sendGameChatMessageMutation = useMutation(api.gameChat.sendMessage).withOptimisticUpdate(
    (localStore, args) => {
      const queryArgs = {
        gameId: args.gameId,
        channel: args.channel,
        limit: 60,
      } as const;
      const existing = localStore.getQuery(api.gameChat.listMessages, queryArgs);
      if (!existing) return;
      const lastCreatedAt = existing[existing.length - 1]?.createdAt ?? 0;
      const optimisticSuffix = `${args.channel}:${existing.length}:${args.text.slice(0, 20)}`;

      const optimisticMessage = {
        _id: `optimistic:${optimisticSuffix}` as Id<"gameChatMessages">,
        channel: args.channel,
        teamId: null,
        text: args.text.trim(),
        createdAt: lastCreatedAt + 1,
        editedAt: null,
        senderUserId: "optimistic-self",
        senderDisplayName: "You",
        senderEnginePlayerId: null,
        isMine: true,
      };
      localStore.setQuery(api.gameChat.listMessages, queryArgs, [...existing, optimisticMessage].slice(-60));
    },
  );
  const editGameChatMessageMutation = useMutation(api.gameChat.editMessage);
  const deleteGameChatMessageMutation = useMutation(api.gameChat.deleteMessage);

  return {
    submitActionMutation,
    submitReinforcementPlacementsMutation,
    resignMutation,
    sendGameChatMessageMutation,
    editGameChatMessageMutation,
    deleteGameChatMessageMutation,
  };
}
