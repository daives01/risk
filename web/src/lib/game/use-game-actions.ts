import { useMutation } from "convex/react";
import { api } from "@backend/_generated/api";

export function useGameActions() {
  const submitActionMutation = useMutation(api.gameplay.submitAction);
  const submitReinforcementPlacementsMutation = useMutation(api.gameplay.submitReinforcementPlacements);
  const resignMutation = useMutation(api.gameplay.resign);
  const sendGameChatMessageMutation = useMutation(api.gameChat.sendMessage);

  return {
    submitActionMutation,
    submitReinforcementPlacementsMutation,
    resignMutation,
    sendGameChatMessageMutation,
  };
}
