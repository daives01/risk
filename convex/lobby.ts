import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./auth.js";
import {
  createRng,
  createDeck,
  calculateReinforcements,
  PLAYER_COLOR_PALETTE,
} from "risk-engine";
import type {
  CardId,
  GameState,
  PlayerId,
  RulesetConfig,
  TeamId,
  TerritoryId,
  GraphMap,
} from "risk-engine";
import {
  resolveMapPlayerLimits,
  validateMapPlayerLimits,
} from "./mapPlayerLimits";
import {
  createBalancedTeamAssignments,
  resolveTeamModeConfig,
  validateTeamAssignments,
  type TeamId as LobbyTeamId,
} from "./gameTeams";
import {
  resolveEffectiveRuleset,
  resolveRulesetFromOverrides,
  rulesetOverridesValidator,
  type RulesetOverrides,
} from "./rulesets";
import {
  canEditPlayerColor,
  firstAvailablePlayerColor,
  isPlayerColor,
  resolvePlayerColors,
} from "./playerColors";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function toStoredRuleset(ruleset: RulesetConfig) {
  return JSON.parse(JSON.stringify(ruleset));
}

export const createGame = mutation({
  args: {
    name: v.string(),
    mapId: v.string(),
    visibility: v.optional(
      v.union(v.literal("public"), v.literal("unlisted")),
    ),
    maxPlayers: v.optional(v.number()),
    teamModeEnabled: v.optional(v.boolean()),
    teamAssignmentStrategy: v.optional(
      v.union(v.literal("manual"), v.literal("balancedRandom")),
    ),
    rulesetOverrides: v.optional(rulesetOverridesValidator),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    // Verify the map exists
    const map = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", args.mapId))
      .unique();
    if (!map || map.authoring.status !== "published") {
      throw new Error("Map not found or not published");
    }

    const territoryCount = Object.keys(map.graphMap.territories).length;
    const playerLimits = resolveMapPlayerLimits(map.playerLimits, territoryCount);
    const playerLimitsErrors = validateMapPlayerLimits(playerLimits, territoryCount);
    if (playerLimitsErrors.length > 0) {
      throw new Error(`Map is misconfigured: ${playerLimitsErrors.join(", ")}`);
    }

    const maxPlayers = args.maxPlayers ?? playerLimits.maxPlayers;
    if (maxPlayers < playerLimits.minPlayers || maxPlayers > playerLimits.maxPlayers) {
      throw new Error(
        `maxPlayers must be between ${playerLimits.minPlayers} and ${playerLimits.maxPlayers} for this map`,
      );
    }
    if (maxPlayers > PLAYER_COLOR_PALETTE.length) {
      throw new Error(`maxPlayers cannot exceed ${PLAYER_COLOR_PALETTE.length} due to color limits`);
    }

    const rulesetOverrides = args.rulesetOverrides as RulesetOverrides | undefined;
    resolveRulesetFromOverrides(args.teamModeEnabled ?? false, rulesetOverrides);

    const gameId = await ctx.db.insert("games", {
      name: args.name,
      mapId: args.mapId,
      status: "lobby",
      visibility: args.visibility ?? "unlisted",
      maxPlayers,
      teamModeEnabled: args.teamModeEnabled ?? false,
      teamAssignmentStrategy: args.teamAssignmentStrategy ?? "manual",
      rulesetOverrides,
      createdBy: String(user._id),
      createdAt: Date.now(),
    });

    // Add creator as host
    await ctx.db.insert("gamePlayers", {
      gameId,
      userId: String(user._id),
      displayName: user.name,
      color: PLAYER_COLOR_PALETTE[0],
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

    const nextColor = firstAvailablePlayerColor(players);
    if (!nextColor) {
      throw new Error("No player colors are available in this lobby");
    }

    await ctx.db.insert("gamePlayers", {
      gameId: invite.gameId,
      userId: String(user._id),
      displayName: user.name,
      color: nextColor,
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

    const playerColors = resolvePlayerColors(players);

    return {
      game: {
        _id: game._id,
        name: game.name,
        mapId: game.mapId,
        status: game.status,
        visibility: game.visibility,
        maxPlayers: game.maxPlayers,
        createdBy: game.createdBy,
        createdAt: game.createdAt,
        startedAt: game.startedAt ?? null,
        teamModeEnabled: game.teamModeEnabled ?? false,
        teamAssignmentStrategy: game.teamAssignmentStrategy ?? "manual",
        rulesetOverrides: game.rulesetOverrides ?? null,
        effectiveRuleset: game.effectiveRuleset ?? null,
      },
      players: players.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        color: playerColors[p.userId]!,
        role: p.role,
        joinedAt: p.joinedAt,
        teamId: p.teamId ?? null,
      })),
      inviteCode: invite?.code ?? null,
    };
  },
});

export const setPlayerColor = mutation({
  args: {
    gameId: v.id("games"),
    userId: v.string(),
    color: v.string(),
  },
  handler: async (ctx, { gameId, userId, color }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

    const callerUserId = String(user._id);
    if (!canEditPlayerColor(callerUserId, game.createdBy, userId)) {
      throw new Error("You do not have permission to change this player's color");
    }
    if (!isPlayerColor(color)) {
      throw new Error("Invalid player color");
    }

    const playerDocs = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();
    const targetPlayer = playerDocs.find((playerDoc) => playerDoc.userId === userId);
    if (!targetPlayer) throw new Error("Player not in this game");

    const conflict = playerDocs.find(
      (playerDoc) => playerDoc.userId !== userId && playerDoc.color === color,
    );
    if (conflict) {
      throw new Error("Color already taken by another player");
    }

    await ctx.db.patch(targetPlayer._id, { color });
  },
});

export const setPlayerTeam = mutation({
  args: {
    gameId: v.id("games"),
    userId: v.string(),
    teamId: v.union(v.literal("team-1"), v.literal("team-2")),
  },
  handler: async (ctx, { gameId, userId, teamId }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");
    if (game.createdBy !== String(user._id)) {
      throw new Error("Only the host can assign teams");
    }
    if (!game.teamModeEnabled) {
      throw new Error("Team mode is not enabled for this game");
    }

    const playerDoc = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId_userId", (q) =>
        q.eq("gameId", gameId).eq("userId", userId),
      )
      .unique();
    if (!playerDoc) throw new Error("Player not in this game");

    await ctx.db.patch(playerDoc._id, { teamId });
  },
});

export const rebalanceTeams = mutation({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, { gameId }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");
    if (game.createdBy !== String(user._id)) {
      throw new Error("Only the host can rebalance teams");
    }
    if (!game.teamModeEnabled) {
      throw new Error("Team mode is not enabled for this game");
    }

    const playerDocs = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();

    const assignments = createBalancedTeamAssignments(
      playerDocs.map((playerDoc) => playerDoc.userId),
      `${gameId}:lobby-teams`,
    );

    for (const playerDoc of playerDocs) {
      await ctx.db.patch(playerDoc._id, {
        teamId: assignments[playerDoc.userId]!,
      });
    }
  },
});

export const setRulesetOverrides = mutation({
  args: {
    gameId: v.id("games"),
    rulesetOverrides: v.optional(rulesetOverridesValidator),
  },
  handler: async (ctx, { gameId, rulesetOverrides }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");
    if (game.createdBy !== String(user._id)) {
      throw new Error("Only the host can update game rules");
    }

    const effectiveRuleset = resolveRulesetFromOverrides(
      game.teamModeEnabled ?? false,
      rulesetOverrides as RulesetOverrides | undefined,
    );

    await ctx.db.patch(gameId, {
      rulesetOverrides,
      effectiveRuleset: toStoredRuleset(effectiveRuleset),
    });
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

    // Fetch map
    const mapDoc = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", game.mapId))
      .unique();
    if (!mapDoc || mapDoc.authoring.status !== "published") {
      throw new Error("Map not found or not published");
    }

    const graphMap = mapDoc.graphMap as unknown as GraphMap;
    const territoryCount = Object.keys(graphMap.territories).length;
    const playerLimits = resolveMapPlayerLimits(mapDoc.playerLimits, territoryCount);
    const playerLimitsErrors = validateMapPlayerLimits(playerLimits, territoryCount);
    if (playerLimitsErrors.length > 0) {
      throw new Error(`Map is misconfigured: ${playerLimitsErrors.join(", ")}`);
    }

    if (playerDocs.length < playerLimits.minPlayers) {
      throw new Error(
        `Need at least ${playerLimits.minPlayers} players to start this map`,
      );
    }
    if (playerDocs.length > playerLimits.maxPlayers) {
      throw new Error(
        `This map allows at most ${playerLimits.maxPlayers} players`,
      );
    }

    const territoryIds = Object.keys(graphMap.territories) as TerritoryId[];
    const effectiveRuleset = resolveEffectiveRuleset({
      teamModeEnabled: game.teamModeEnabled,
      rulesetOverrides: game.rulesetOverrides as RulesetOverrides | undefined,
      effectiveRuleset: game.effectiveRuleset as RulesetConfig | undefined,
    });
    const setup = effectiveRuleset.setup;
    const teamMode = resolveTeamModeConfig(game);
    const teamsConfig = effectiveRuleset.teams;

    // Build engine player IDs (use index-based IDs for determinism)
    const playerIds: PlayerId[] = playerDocs.map(
      (_, i) => `p${i}` as PlayerId,
    );
    const playerColors = resolvePlayerColors(playerDocs);

    let teamAssignmentsByUserId: Record<string, LobbyTeamId> = {};
    if (teamMode.enabled) {
      if (teamMode.assignmentStrategy === "balancedRandom") {
        teamAssignmentsByUserId = createBalancedTeamAssignments(
          playerDocs.map((playerDoc) => playerDoc.userId),
          `${gameId}:start-teams`,
        );
      } else {
        teamAssignmentsByUserId = Object.fromEntries(
          playerDocs.map((playerDoc) => [playerDoc.userId, playerDoc.teamId as LobbyTeamId]),
        );
      }
      const assignmentErrors = validateTeamAssignments(
        playerDocs.map((playerDoc) => playerDoc.userId),
        teamAssignmentsByUserId,
      );
      if (assignmentErrors.length > 0) {
        throw new Error(assignmentErrors[0]);
      }
    }

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
    const players: Record<string, { status: "alive"; teamId?: TeamId }> = {};
    for (let i = 0; i < playerIds.length; i++) {
      const pid = playerIds[i]!;
      const playerDoc = playerDocs[i]!;
      const teamId = teamMode.enabled ? teamAssignmentsByUserId[playerDoc.userId] : undefined;
      players[pid] = {
        status: "alive",
        ...(teamId ? { teamId: teamId as TeamId } : {}),
      };
    }

    // Create card deck
    const deckResult = createDeck(
      effectiveRuleset.cards.deckDefinition,
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
      { territories, players } as GameState,
      firstPlayer,
      graphMap,
      teamsConfig,
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
      fortifiesUsedThisTurn: 0,
      rng: rng.state,
      stateVersion: 1,
      rulesetVersion: 1,
    };

    // Update gamePlayers with engine player IDs
    for (let i = 0; i < playerDocs.length; i++) {
      await ctx.db.patch(playerDocs[i]!._id, {
        enginePlayerId: playerIds[i],
        color: playerColors[playerDocs[i]!.userId]!,
        ...(teamMode.enabled
          ? { teamId: teamAssignmentsByUserId[playerDocs[i]!.userId]! }
          : { teamId: undefined }),
      });
    }

    // Persist engine state and transition to active
    await ctx.db.patch(gameId, {
      status: "active",
      startedAt: Date.now(),
      state: engineState,
      stateVersion: 1,
      effectiveRuleset: toStoredRuleset(effectiveRuleset),
    });

    return { gameId };
  },
});
