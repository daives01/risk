import { query } from "./_generated/server";
import { v } from "convex/values";
import { ENGINE_VERSION } from "risk-engine";
import type { GameState, PlayerId } from "risk-engine";
import { authComponent } from "./auth.js";

export const engineVersion = query({
  handler: async () => {
    return ENGINE_VERSION;
  },
});

/** Strip private info from GameState to produce a public view. */
function publicProjection(state: GameState) {
  // Per-player hand sizes (not contents)
  const handSizes: Record<string, number> = {};
  for (const [pid, hand] of Object.entries(state.hands)) {
    handSizes[pid] = hand.length;
  }

  return {
    players: state.players,
    turnOrder: state.turnOrder,
    territories: state.territories,
    turn: state.turn,
    pending: state.pending,
    reinforcements: state.reinforcements,
    capturedThisTurn: state.capturedThisTurn,
    tradesCompleted: state.tradesCompleted,
    deckCount: state.deck.draw.length,
    discardCount: state.deck.discard.length,
    handSizes,
    stateVersion: state.stateVersion,
  };
}

/**
 * Public game view — safe for spectators. Never exposes RNG seed,
 * card hands, or deck order.
 */
export const getGameView = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;

    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();

    const playerMap = players.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      role: p.role,
      enginePlayerId: p.enginePlayerId ?? null,
      teamId: p.teamId ?? null,
    }));

    if (game.status !== "active" && game.status !== "finished") {
      return {
        _id: game._id,
        name: game.name,
        mapId: game.mapId,
        status: game.status,
        visibility: game.visibility,
        maxPlayers: game.maxPlayers,
        teamModeEnabled: game.teamModeEnabled ?? false,
        teamAssignmentStrategy: game.teamAssignmentStrategy ?? "manual",
        rulesetOverrides: game.rulesetOverrides ?? null,
        effectiveRuleset: game.effectiveRuleset ?? null,
        createdAt: game.createdAt,
        startedAt: game.startedAt ?? null,
        finishedAt: game.finishedAt ?? null,
        players: playerMap,
        state: null,
      };
    }

    const state = game.state as GameState | undefined;

    return {
      _id: game._id,
      name: game.name,
      mapId: game.mapId,
      status: game.status,
      visibility: game.visibility,
      maxPlayers: game.maxPlayers,
      teamModeEnabled: game.teamModeEnabled ?? false,
      teamAssignmentStrategy: game.teamAssignmentStrategy ?? "manual",
      rulesetOverrides: game.rulesetOverrides ?? null,
      effectiveRuleset: game.effectiveRuleset ?? null,
      createdAt: game.createdAt,
      startedAt: game.startedAt ?? null,
      finishedAt: game.finishedAt ?? null,
      players: playerMap,
      state: state ? publicProjection(state) : null,
    };
  },
});

/**
 * Authenticated player game view — includes the caller's own hand contents
 * in addition to the public projection.
 */
export const getGameViewAsPlayer = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) return null;

    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();

    const playerMap = players.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      role: p.role,
      enginePlayerId: p.enginePlayerId ?? null,
      teamId: p.teamId ?? null,
    }));

    // Find the caller's enginePlayerId
    const callerId = String(user._id);
    const callerPlayer = players.find((p) => p.userId === callerId);

    if (game.status !== "active" && game.status !== "finished") {
      return {
        _id: game._id,
        name: game.name,
        mapId: game.mapId,
        status: game.status,
        visibility: game.visibility,
        maxPlayers: game.maxPlayers,
        teamModeEnabled: game.teamModeEnabled ?? false,
        teamAssignmentStrategy: game.teamAssignmentStrategy ?? "manual",
        rulesetOverrides: game.rulesetOverrides ?? null,
        effectiveRuleset: game.effectiveRuleset ?? null,
        createdAt: game.createdAt,
        startedAt: game.startedAt ?? null,
        finishedAt: game.finishedAt ?? null,
        players: playerMap,
        state: null,
        myHand: null,
        myEnginePlayerId: callerPlayer?.enginePlayerId ?? null,
      };
    }

    const state = game.state as GameState | undefined;
    const enginePlayerId = callerPlayer?.enginePlayerId as
      | PlayerId
      | undefined;

    // Extract this player's hand (card IDs + card details)
    let myHand: Array<{
      cardId: string;
      kind: string;
      territoryId?: string;
    }> | null = null;
    if (state && enginePlayerId && state.hands[enginePlayerId]) {
      myHand = state.hands[enginePlayerId]!.map((cardId) => {
        const card = state.cardsById[cardId];
        return {
          cardId: cardId as string,
          kind: card?.kind ?? "W",
          territoryId: card?.territoryId as string | undefined,
        };
      });
    }

    return {
      _id: game._id,
      name: game.name,
      mapId: game.mapId,
      status: game.status,
      visibility: game.visibility,
      maxPlayers: game.maxPlayers,
      teamModeEnabled: game.teamModeEnabled ?? false,
      teamAssignmentStrategy: game.teamAssignmentStrategy ?? "manual",
      rulesetOverrides: game.rulesetOverrides ?? null,
      effectiveRuleset: game.effectiveRuleset ?? null,
      createdAt: game.createdAt,
      startedAt: game.startedAt ?? null,
      finishedAt: game.finishedAt ?? null,
      players: playerMap,
      state: state ? publicProjection(state) : null,
      myHand,
      myEnginePlayerId: enginePlayerId ?? null,
    };
  },
});

/** List public games (active or lobby). */
export const listPublicGames = query({
  handler: async (ctx) => {
    const games = await ctx.db.query("games").collect();
    return games
      .filter(
        (g) =>
          g.visibility === "public" &&
          (g.status === "lobby" || g.status === "active"),
      )
      .map((g) => ({
        _id: g._id,
        name: g.name,
        mapId: g.mapId,
        status: g.status,
        maxPlayers: g.maxPlayers,
        teamModeEnabled: g.teamModeEnabled ?? false,
        createdAt: g.createdAt,
        startedAt: g.startedAt ?? null,
      }));
  },
});

/** List games the authenticated user is participating in. */
export const listMyGames = query({
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return [];

    const callerId = String(user._id);
    const playerDocs = await ctx.db
      .query("gamePlayers")
      .withIndex("by_userId", (q) => q.eq("userId", callerId))
      .collect();

    const games = await Promise.all(
      playerDocs.map(async (pd) => {
        const game = await ctx.db.get(pd.gameId);
        if (!game) return null;
        return {
          _id: game._id,
          name: game.name,
          mapId: game.mapId,
          status: game.status,
          maxPlayers: game.maxPlayers,
          teamModeEnabled: game.teamModeEnabled ?? false,
          createdAt: game.createdAt,
          startedAt: game.startedAt ?? null,
          finishedAt: game.finishedAt ?? null,
          myRole: pd.role,
          myEnginePlayerId: pd.enginePlayerId ?? null,
        };
      }),
    );

    return games.filter((g) => g !== null);
  },
});
