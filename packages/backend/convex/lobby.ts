import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth.js";
import {
  createRng,
  createDeck,
  calculateReinforcements,
  defaultRuleset,
} from "risk-engine";
import type {
  CardId,
  GameState,
  PlayerId,
  TerritoryId,
  GraphMap,
} from "risk-engine";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const createGame = mutation({
  args: {
    name: v.string(),
    mapId: v.string(),
    visibility: v.optional(
      v.union(v.literal("public"), v.literal("unlisted")),
    ),
    maxPlayers: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Verify the map exists
    const map = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", args.mapId))
      .unique();
    if (!map) throw new Error("Map not found");

    const maxPlayers = args.maxPlayers ?? 6;
    if (maxPlayers < 2 || maxPlayers > 6) {
      throw new Error("maxPlayers must be between 2 and 6");
    }

    const gameId = await ctx.db.insert("games", {
      name: args.name,
      mapId: args.mapId,
      status: "lobby",
      visibility: args.visibility ?? "unlisted",
      maxPlayers,
      createdBy: String(user._id),
      createdAt: Date.now(),
    });

    // Add creator as host
    await ctx.db.insert("gamePlayers", {
      gameId,
      userId: String(user._id),
      displayName: user.name,
      role: "host",
      joinedAt: Date.now(),
    });

    // Generate invite code
    const code = generateInviteCode();
    await ctx.db.insert("gameInvites", {
      gameId,
      code,
      createdAt: Date.now(),
    });

    return { gameId, inviteCode: code };
  },
});

export const joinGameByInvite = mutation({
  args: {
    code: v.string(),
  },
  handler: async (ctx, { code }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const invite = await ctx.db
      .query("gameInvites")
      .withIndex("by_code", (q) => q.eq("code", code.toUpperCase()))
      .unique();
    if (!invite) throw new Error("Invalid invite code");

    if (invite.expiresAt && invite.expiresAt < Date.now()) {
      throw new Error("Invite code has expired");
    }

    const game = await ctx.db.get(invite.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    // Check if already joined
    const existing = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId_userId", (q) =>
        q.eq("gameId", invite.gameId).eq("userId", String(user._id)),
      )
      .unique();
    if (existing) throw new Error("Already in this game");

    // Check slot availability
    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", invite.gameId))
      .collect();
    if (players.length >= game.maxPlayers) {
      throw new Error("Game is full");
    }

    await ctx.db.insert("gamePlayers", {
      gameId: invite.gameId,
      userId: String(user._id),
      displayName: user.name,
      role: "player",
      joinedAt: Date.now(),
    });

    return { gameId: invite.gameId };
  },
});

export const kickPlayer = mutation({
  args: {
    gameId: v.id("games"),
    userId: v.string(),
  },
  handler: async (ctx, { gameId, userId }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");
    const callerId = String(user._id);
    if (game.createdBy !== callerId) throw new Error("Only the host can kick players");

    // Can't kick yourself (the host)
    if (userId === callerId) throw new Error("Cannot kick yourself");

    const playerDoc = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId_userId", (q) =>
        q.eq("gameId", gameId).eq("userId", userId),
      )
      .unique();
    if (!playerDoc) throw new Error("Player not in this game");

    await ctx.db.delete(playerDoc._id);
  },
});

export const getLobby = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;

    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();

    const invite = await ctx.db
      .query("gameInvites")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .first();

    return {
      game,
      players: players.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        role: p.role,
        joinedAt: p.joinedAt,
      })),
      inviteCode: invite?.code ?? null,
    };
  },
});

export const startGame = mutation({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, { gameId }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    const callerId = String(user._id);
    if (game.createdBy !== callerId) {
      throw new Error("Only the host can start the game");
    }

    // Fetch players
    const playerDocs = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();

    if (playerDocs.length < 2) {
      throw new Error("Need at least 2 players to start");
    }

    // Fetch map
    const mapDoc = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", game.mapId))
      .unique();
    if (!mapDoc) throw new Error("Map not found");

    const graphMap = mapDoc.graphMap as unknown as GraphMap;
    const territoryIds = Object.keys(graphMap.territories) as TerritoryId[];
    const setup = defaultRuleset.setup;

    // Build engine player IDs (use index-based IDs for determinism)
    const playerIds: PlayerId[] = playerDocs.map(
      (_, i) => `p${i}` as PlayerId,
    );

    // Seed the RNG
    const seed = `${gameId}-${Date.now()}`;
    const rng = createRng({ seed, index: 0 });

    // Shuffle turn order
    const turnOrder = rng.shuffle(playerIds);

    // Shuffle territories for assignment
    const shuffledTerritories = rng.shuffle(territoryIds);

    // Determine initial armies per player
    const playerCount = playerIds.length;
    const initialArmies =
      setup.playerInitialArmies[playerCount] ?? 20;

    // Assign territories round-robin + neutrals
    const neutralCount = Math.min(
      setup.neutralTerritoryCount,
      territoryIds.length - playerCount, // don't exceed available
    );
    const neutralTerritories = shuffledTerritories.slice(0, neutralCount);
    const playerTerritories = shuffledTerritories.slice(neutralCount);

    const territories: Record<string, { ownerId: PlayerId | "neutral"; armies: number }> = {};

    // Place neutrals
    for (const tid of neutralTerritories) {
      territories[tid] = {
        ownerId: "neutral" as PlayerId | "neutral",
        armies: setup.neutralInitialArmies,
      };
    }

    // Distribute remaining territories round-robin among players
    const playerTerritoryAssignments: Record<string, TerritoryId[]> = {};
    for (const pid of turnOrder) {
      playerTerritoryAssignments[pid] = [];
    }
    for (let i = 0; i < playerTerritories.length; i++) {
      const pid = turnOrder[i % turnOrder.length]!;
      const tid = playerTerritories[i]!;
      territories[tid] = { ownerId: pid, armies: 1 };
      playerTerritoryAssignments[pid]!.push(tid);
    }

    // Distribute remaining armies randomly across each player's territories
    for (const pid of turnOrder) {
      const owned = playerTerritoryAssignments[pid]!;
      let remaining = initialArmies - owned.length; // already placed 1 per territory
      while (remaining > 0) {
        const idx = rng.nextInt(0, owned.length - 1);
        territories[owned[idx]!]!.armies += 1;
        remaining--;
      }
    }

    // Build players record
    const players: Record<string, { status: "alive" }> = {};
    for (const pid of playerIds) {
      players[pid] = { status: "alive" };
    }

    // Create card deck
    const deckResult = createDeck(
      defaultRuleset.cards.deckDefinition,
      territoryIds,
      rng,
    );

    // Empty hands for all players
    const hands: Record<string, readonly CardId[]> = {};
    for (const pid of playerIds) {
      hands[pid] = [];
    }

    // Calculate reinforcements for first player
    const firstPlayer = turnOrder[0]!;
    const reinforcementResult = calculateReinforcements(
      { territories } as GameState,
      firstPlayer,
      graphMap,
    );

    const engineState: GameState = {
      players,
      turnOrder,
      territories,
      turn: {
        currentPlayerId: firstPlayer,
        phase: "Reinforcement",
        round: 1,
      },
      reinforcements: {
        remaining: reinforcementResult.total,
        sources: reinforcementResult.sources,
      },
      deck: deckResult.deck,
      cardsById: deckResult.cardsById,
      hands,
      tradesCompleted: 0,
      capturedThisTurn: false,
      rng: rng.state,
      stateVersion: 1,
      rulesetVersion: 1,
    };

    // Update gamePlayers with engine player IDs
    for (let i = 0; i < playerDocs.length; i++) {
      await ctx.db.patch(playerDocs[i]!._id, {
        enginePlayerId: playerIds[i],
      });
    }

    // Persist engine state and transition to active
    await ctx.db.patch(gameId, {
      status: "active",
      startedAt: Date.now(),
      state: engineState,
      stateVersion: 1,
    });

    return { gameId };
  },
});
