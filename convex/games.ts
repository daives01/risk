import { query } from "./_generated/server";
import { v } from "convex/values";
import { ENGINE_VERSION } from "risk-engine";
import type { GameState, PlayerId } from "risk-engine";
import { authComponent } from "./auth.js";
import { getTeamIds, resolveTeamNames } from "./gameTeams";
import { resolvePlayerColors } from "./playerColors";
import { readGameStateNullable } from "./typeAdapters";

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
    fortifiesUsedThisTurn: state.fortifiesUsedThisTurn,
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
    const playerColors = resolvePlayerColors(players);

    const playerMap = players.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      color: playerColors[p.userId]!,
      role: p.role,
      enginePlayerId: p.enginePlayerId ?? null,
      teamId: p.teamId ?? null,
    }));
    const teamCount = game.teamModeEnabled ? Math.max(2, Math.min(game.teamCount ?? 2, Math.max(2, players.length))) : null;
    const teamIds = teamCount ? getTeamIds(teamCount) : [];
    const teamNames = teamCount ? resolveTeamNames(teamIds, game.teamNames as Record<string, string> | undefined) : null;

    if (game.status !== "active" && game.status !== "finished") {
      return {
        _id: game._id,
        name: game.name,
        mapId: game.mapId,
        status: game.status,
        visibility: game.visibility,
        timingMode: game.timingMode ?? "realtime",
        excludeWeekends: game.excludeWeekends ?? false,
        turnStartedAt: game.turnStartedAt ?? null,
        turnDeadlineAt: game.turnDeadlineAt ?? null,
        maxPlayers: game.maxPlayers,
        teamModeEnabled: game.teamModeEnabled ?? false,
        teamCount,
        teamNames,
        teamAssignmentStrategy: game.teamAssignmentStrategy ?? "manual",
        rulesetOverrides: game.rulesetOverrides ?? null,
        effectiveRuleset: game.effectiveRuleset ?? null,
        winningPlayerId: game.winningPlayerId ?? null,
        winningTeamId: game.winningTeamId ?? null,
        createdAt: game.createdAt,
        startedAt: game.startedAt ?? null,
        finishedAt: game.finishedAt ?? null,
        players: playerMap,
        state: null,
      };
    }

    const state = readGameStateNullable(game.state);

    return {
      _id: game._id,
      name: game.name,
      mapId: game.mapId,
      status: game.status,
      visibility: game.visibility,
      timingMode: game.timingMode ?? "realtime",
      excludeWeekends: game.excludeWeekends ?? false,
      turnStartedAt: game.turnStartedAt ?? null,
      turnDeadlineAt: game.turnDeadlineAt ?? null,
      maxPlayers: game.maxPlayers,
      teamModeEnabled: game.teamModeEnabled ?? false,
      teamCount,
      teamNames,
      teamAssignmentStrategy: game.teamAssignmentStrategy ?? "manual",
      rulesetOverrides: game.rulesetOverrides ?? null,
      effectiveRuleset: game.effectiveRuleset ?? null,
      winningPlayerId: game.winningPlayerId ?? null,
      winningTeamId: game.winningTeamId ?? null,
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
    const playerColors = resolvePlayerColors(players);

    const playerMap = players.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      color: playerColors[p.userId]!,
      role: p.role,
      enginePlayerId: p.enginePlayerId ?? null,
      teamId: p.teamId ?? null,
    }));
    const teamCount = game.teamModeEnabled ? Math.max(2, Math.min(game.teamCount ?? 2, Math.max(2, players.length))) : null;
    const teamIds = teamCount ? getTeamIds(teamCount) : [];
    const teamNames = teamCount ? resolveTeamNames(teamIds, game.teamNames as Record<string, string> | undefined) : null;

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
        timingMode: game.timingMode ?? "realtime",
        excludeWeekends: game.excludeWeekends ?? false,
        turnStartedAt: game.turnStartedAt ?? null,
        turnDeadlineAt: game.turnDeadlineAt ?? null,
        maxPlayers: game.maxPlayers,
        teamModeEnabled: game.teamModeEnabled ?? false,
        teamCount,
        teamNames,
        teamAssignmentStrategy: game.teamAssignmentStrategy ?? "manual",
        rulesetOverrides: game.rulesetOverrides ?? null,
        effectiveRuleset: game.effectiveRuleset ?? null,
        winningPlayerId: game.winningPlayerId ?? null,
        winningTeamId: game.winningTeamId ?? null,
        createdAt: game.createdAt,
        startedAt: game.startedAt ?? null,
        finishedAt: game.finishedAt ?? null,
        players: playerMap,
        state: null,
        myHand: null,
        myEnginePlayerId: callerPlayer?.enginePlayerId ?? null,
      };
    }

    const state = readGameStateNullable(game.state);
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
      timingMode: game.timingMode ?? "realtime",
      excludeWeekends: game.excludeWeekends ?? false,
      turnStartedAt: game.turnStartedAt ?? null,
      turnDeadlineAt: game.turnDeadlineAt ?? null,
      maxPlayers: game.maxPlayers,
      teamModeEnabled: game.teamModeEnabled ?? false,
      teamCount,
      teamNames,
      teamAssignmentStrategy: game.teamAssignmentStrategy ?? "manual",
      rulesetOverrides: game.rulesetOverrides ?? null,
      effectiveRuleset: game.effectiveRuleset ?? null,
      winningPlayerId: game.winningPlayerId ?? null,
      winningTeamId: game.winningTeamId ?? null,
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
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const take = Math.min(Math.max(limit ?? 100, 1), 200);
    const [lobbyGames, activeGames] = await Promise.all([
      ctx.db
        .query("games")
        .withIndex("by_visibility_status_createdAt", (q) =>
          q.eq("visibility", "public").eq("status", "lobby"),
        )
        .order("desc")
        .take(take),
      ctx.db
        .query("games")
        .withIndex("by_visibility_status_createdAt", (q) =>
          q.eq("visibility", "public").eq("status", "active"),
        )
        .order("desc")
        .take(take),
    ]);

    return [...lobbyGames, ...activeGames]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, take)
      .map((g) => ({
        _id: g._id,
        name: g.name,
        mapId: g.mapId,
        status: g.status,
        timingMode: g.timingMode ?? "realtime",
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

        let result: "won" | "lost" | null = null;
        if (game.status === "finished") {
          if (game.winningPlayerId) {
            result = pd.enginePlayerId === game.winningPlayerId ? "won" : "lost";
          } else if (game.winningTeamId) {
            result = pd.teamId === game.winningTeamId ? "won" : "lost";
          }
        }

        return {
          _id: game._id,
          name: game.name,
          mapId: game.mapId,
          status: game.status,
          timingMode: game.timingMode ?? "realtime",
          maxPlayers: game.maxPlayers,
          teamModeEnabled: game.teamModeEnabled ?? false,
          createdAt: game.createdAt,
          startedAt: game.startedAt ?? null,
          finishedAt: game.finishedAt ?? null,
          myEnginePlayerId: pd.enginePlayerId ?? null,
          result,
        };
      }),
    );

    return games.filter((g) => g !== null);
  },
});
