import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth.js";
import { applyAction, ActionError, defaultRuleset } from "risk-engine";
import type { Action, CardId, GameState, PlayerId, GraphMap } from "risk-engine";

export const submitAction = mutation({
  args: {
    gameId: v.id("games"),
    expectedVersion: v.number(),
    action: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "active") throw new Error("Game is not active");

    const state = game.state as GameState;
    if (!state) throw new Error("Game has no state");

    // Optimistic concurrency check
    if (state.stateVersion !== args.expectedVersion) {
      throw new Error(
        `Version mismatch: expected ${args.expectedVersion}, current ${state.stateVersion}`,
      );
    }

    // Map caller to engine player ID
    const callerId = String(user._id);
    const playerDoc = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId_userId", (q) =>
        q.eq("gameId", args.gameId).eq("userId", callerId),
      )
      .unique();
    if (!playerDoc || !playerDoc.enginePlayerId) {
      throw new Error("You are not a player in this game");
    }
    const playerId = playerDoc.enginePlayerId as PlayerId;

    // Fetch map for actions that need it
    const mapDoc = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", game.mapId))
      .unique();
    if (!mapDoc) throw new Error("Map not found");
    const graphMap = mapDoc.graphMap as unknown as GraphMap;

    // Apply the action through the engine
    const action = args.action as Action;
    let result;
    try {
      result = applyAction(
        state,
        playerId,
        action,
        graphMap,
        defaultRuleset.combat,
        defaultRuleset.fortify,
        defaultRuleset.cards,
        defaultRuleset.teams,
      );
    } catch (e) {
      if (e instanceof ActionError) {
        throw new Error(e.message);
      }
      throw e;
    }

    // Determine action log index
    const lastAction = await ctx.db
      .query("gameActions")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", args.gameId))
      .order("desc")
      .first();
    const nextIndex = lastAction ? lastAction.index + 1 : 0;

    // Append to action log
    await ctx.db.insert("gameActions", {
      gameId: args.gameId,
      index: nextIndex,
      playerId: playerDoc.enginePlayerId,
      action: args.action,
      events: result.events,
      createdAt: Date.now(),
    });

    // Check if game is over
    const isGameOver = result.state.turn.phase === "GameOver";

    // Persist new state
    await ctx.db.patch(args.gameId, {
      state: result.state,
      stateVersion: result.state.stateVersion,
      ...(isGameOver ? { status: "finished" as const, finishedAt: Date.now() } : {}),
    });

    return {
      events: result.events,
      newVersion: result.state.stateVersion,
    };
  },
});

export const resign = mutation({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, { gameId }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "active") throw new Error("Game is not active");

    const state = game.state as GameState;
    if (!state) throw new Error("Game has no state");

    const callerId = String(user._id);
    const playerDoc = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId_userId", (q) =>
        q.eq("gameId", gameId).eq("userId", callerId),
      )
      .unique();
    if (!playerDoc || !playerDoc.enginePlayerId) {
      throw new Error("You are not a player in this game");
    }
    const playerId = playerDoc.enginePlayerId as PlayerId;

    // Check player is still alive
    if (state.players[playerId]?.status !== "alive") {
      throw new Error("You have already been eliminated");
    }

    // Mark player as defeated; transfer territories to neutral
    const newPlayers = {
      ...state.players,
      [playerId]: { ...state.players[playerId]!, status: "defeated" as const },
    };

    const newTerritories = { ...state.territories };
    for (const [tid, t] of Object.entries(newTerritories)) {
      if (t.ownerId === playerId) {
        newTerritories[tid] = { ...t, ownerId: "neutral" as const };
      }
    }

    // Transfer cards to discard
    const resignerCards = state.hands[playerId] ?? [];
    const newHands = { ...state.hands, [playerId]: [] as readonly CardId[] };
    const newDeck = {
      ...state.deck,
      discard: [...state.deck.discard, ...resignerCards],
    };

    // Check if only 1 alive player remains
    const alivePlayers = state.turnOrder.filter(
      (pid) => newPlayers[pid]!.status === "alive",
    );
    const isGameOver = alivePlayers.length <= 1;

    // If it's the resigning player's turn, advance to next alive player
    let newTurn = state.turn;
    let newReinforcements = state.reinforcements;
    let newCapturedThisTurn = state.capturedThisTurn;

    if (isGameOver) {
      newTurn = { ...state.turn, phase: "GameOver" as const };
    } else if (state.turn.currentPlayerId === playerId) {
      // Find next alive player
      const { turnOrder } = state;
      const currentIndex = turnOrder.indexOf(playerId);
      let nextIndex = currentIndex;
      let wrapped = false;
      do {
        nextIndex = (nextIndex + 1) % turnOrder.length;
        if (nextIndex === 0 && currentIndex !== 0) wrapped = true;
      } while (newPlayers[turnOrder[nextIndex]!]!.status !== "alive");

      const nextPlayerId = turnOrder[nextIndex]!;
      const newRound = wrapped ? state.turn.round + 1 : state.turn.round;

      // Fetch map for reinforcements
      const mapDoc = await ctx.db
        .query("maps")
        .withIndex("by_mapId", (q) => q.eq("mapId", game.mapId))
        .unique();
      const graphMap = mapDoc!.graphMap as unknown as GraphMap;

      const { calculateReinforcements } = await import("risk-engine");
      const reinforcementResult = calculateReinforcements(
        { territories: newTerritories } as GameState,
        nextPlayerId,
        graphMap,
      );

      newTurn = {
        currentPlayerId: nextPlayerId,
        phase: "Reinforcement" as const,
        round: newRound,
      };
      newReinforcements = {
        remaining: reinforcementResult.total,
        sources: reinforcementResult.sources,
      };
      newCapturedThisTurn = false;
    }

    const newState: GameState = {
      ...state,
      players: newPlayers,
      territories: newTerritories,
      hands: newHands,
      deck: newDeck,
      turn: newTurn,
      reinforcements: newReinforcements,
      pending: isGameOver || state.turn.currentPlayerId === playerId ? undefined : state.pending,
      capturedThisTurn: newCapturedThisTurn,
      stateVersion: state.stateVersion + 1,
    };

    // Log the resignation
    const lastAction = await ctx.db
      .query("gameActions")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId))
      .order("desc")
      .first();
    const nextIndex = lastAction ? lastAction.index + 1 : 0;

    const events = [
      { type: "PlayerEliminated", eliminatedId: playerId, byId: playerId, cardsTransferred: resignerCards },
      ...(isGameOver && alivePlayers.length === 1
        ? [{ type: "GameEnded", winningPlayerId: alivePlayers[0] }]
        : []),
    ];

    await ctx.db.insert("gameActions", {
      gameId,
      index: nextIndex,
      playerId,
      action: { type: "Resign" },
      events,
      createdAt: Date.now(),
    });

    await ctx.db.patch(gameId, {
      state: newState,
      stateVersion: newState.stateVersion,
      ...(isGameOver ? { status: "finished" as const, finishedAt: Date.now() } : {}),
    });

    return { events, newVersion: newState.stateVersion };
  },
});
