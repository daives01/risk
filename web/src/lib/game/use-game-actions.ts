import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import type { Action, TerritoryId } from "risk-engine";
import type { PublicState } from "@/lib/game/types";

type GameViewState = {
  state: PublicState | null;
};

function applyOptimisticAction(state: PublicState, action: Action): PublicState | null {
  switch (action.type) {
    case "PlaceReinforcements": {
      if (state.turn.phase !== "Reinforcement") return null;
      const territory = state.territories[action.territoryId];
      if (!territory) return null;
      const remaining = state.reinforcements?.remaining ?? 0;
      if (remaining <= 0) return null;
      const nextRemaining = Math.max(0, remaining - action.count);
      const nextTerritories = {
        ...state.territories,
        [action.territoryId]: { ...territory, armies: territory.armies + action.count },
      };
      const nextPhase = nextRemaining === 0 ? "Attack" : state.turn.phase;
      return {
        ...state,
        territories: nextTerritories,
        reinforcements: nextRemaining === 0 ? undefined : { ...state.reinforcements!, remaining: nextRemaining },
        turn: nextPhase === state.turn.phase ? state.turn : { ...state.turn, phase: nextPhase },
        stateVersion: state.stateVersion + 1,
      };
    }
    case "Occupy": {
      const pending = state.pending;
      if (!pending) return null;
      const fromTerritory = state.territories[pending.from];
      const toTerritory = state.territories[pending.to];
      if (!fromTerritory || !toTerritory) return null;
      return {
        ...state,
        territories: {
          ...state.territories,
          [pending.from]: { ...fromTerritory, armies: fromTerritory.armies - action.moveArmies },
          [pending.to]: { ...toTerritory, armies: toTerritory.armies + action.moveArmies },
        },
        pending: undefined,
        stateVersion: state.stateVersion + 1,
      };
    }
    case "Fortify": {
      const fromTerritory = state.territories[action.from];
      const toTerritory = state.territories[action.to];
      if (!fromTerritory || !toTerritory) return null;
      const fortifiesUsed = state.fortifiesUsedThisTurn ?? 0;
      return {
        ...state,
        territories: {
          ...state.territories,
          [action.from]: { ...fromTerritory, armies: fromTerritory.armies - action.count },
          [action.to]: { ...toTerritory, armies: toTerritory.armies + action.count },
        },
        fortifiesUsedThisTurn: fortifiesUsed + 1,
        stateVersion: state.stateVersion + 1,
      };
    }
    case "EndAttackPhase": {
      if (state.turn.phase !== "Attack") return null;
      return {
        ...state,
        turn: { ...state.turn, phase: "Fortify" },
        stateVersion: state.stateVersion + 1,
      };
    }
    default:
      return null;
  }
}

function updateGameViewState(
  localStore: OptimisticLocalStore,
  gameId: Id<"games">,
  updater: (state: PublicState) => PublicState | null,
) {
  const queryArgs = { gameId } as const;
  const updateQuery = <Query extends typeof api.games.getGameView | typeof api.games.getGameViewAsPlayer>(
    query: Query,
  ) => {
    const existing = localStore.getQuery(
      query,
      queryArgs as unknown as Parameters<typeof localStore.getQuery>[1],
    ) as unknown as GameViewState | null | undefined;
    if (!existing || !existing.state) return;
    const nextState = updater(existing.state);
    if (!nextState) return;
    const payload = ({ ...existing, state: nextState } as unknown) as FunctionReturnType<Query>;
    localStore.setQuery(query, queryArgs as unknown as Parameters<typeof localStore.setQuery>[1], payload);
  };
  updateQuery(api.games.getGameView);
  updateQuery(api.games.getGameViewAsPlayer);
}

export function useGameActions() {
  const submitActionMutation = useMutation(api.gameplay.submitAction).withOptimisticUpdate(
    (localStore, args) => {
      const action = args.action as Action;
      updateGameViewState(localStore, args.gameId, (state) => applyOptimisticAction(state, action));
    },
  );
  const submitReinforcementPlacementsMutation = useMutation(
    api.gameplay.submitReinforcementPlacements,
  ).withOptimisticUpdate((localStore, args) => {
    updateGameViewState(localStore, args.gameId, (state) => {
      let nextState: PublicState | null = state;
      for (const placement of args.placements) {
        if (!nextState) return null;
        nextState = applyOptimisticAction(nextState, {
          type: "PlaceReinforcements",
          territoryId: placement.territoryId as TerritoryId,
          count: placement.count,
        });
      }
      return nextState;
    });
  });
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
