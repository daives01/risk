import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authComponent } from "./auth.js";
import {
  createRng,
  createDeck,
  calculateReinforcements,
  PLAYER_COLOR_PALETTE,
  resolveInitialArmies,
} from "risk-engine";
import type {
  CardId,
  GameState,
  PlayerId,
  RulesetConfig,
  TeamId,
  TerritoryId,
} from "risk-engine";
import {
  resolveMapPlayerLimits,
  validateMapPlayerLimits,
} from "./mapPlayerLimits";
import {
  createBalancedTeamAssignments,
  getTeamIds,
  resolveTeamNames,
  resolveTeamModeConfig,
  validateTeamNameUniqueness,
  validateTeamAssignments,
} from "./gameTeams";
import {
  resolveEffectiveRuleset,
  resolveRulesetFromOverrides,
  rulesetOverridesValidator,
  sanitizeRulesetOverrides,
  type RulesetOverrides,
} from "./rulesets";
import {
  canEditPlayerColor,
  firstAvailablePlayerColor,
  isPlayerColor,
  resolvePlayerColors,
  resolveTeamAwarePlayerColors,
} from "./playerColors";
import { distributeInitialArmiesCappedRandom } from "./initialPlacement";
import { computeTurnDeadlineAt, isAsyncTimingMode, type GameTimingMode } from "./gameTiming";
import { readGraphMap } from "./typeAdapters";
import { generateUniqueInviteCode } from "./inviteCodes";
import { createTeamAwareTurnOrder } from "./teamTurnOrder";

const DEFAULT_GAME_VISIBILITY = "unlisted" as const;

function toStoredRuleset(ruleset: RulesetConfig) {
  return JSON.parse(JSON.stringify(ruleset));
}

function resolveLobbyTeamCount(game: {
  teamModeEnabled?: boolean;
  teamCount?: number;
}, playerCount: number): number {
  if (!game.teamModeEnabled) return 0;
  const defaultCount = Math.min(2, Math.max(2, playerCount));
  const raw = game.teamCount ?? defaultCount;
  const bounded = Math.max(2, Math.min(raw, Math.max(2, playerCount)));
  return Number.isInteger(bounded) ? bounded : defaultCount;
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
    timingMode: v.optional(
      v.union(v.literal("realtime"), v.literal("async_1d"), v.literal("async_3d")),
    ),
    excludeWeekends: v.optional(v.boolean()),
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

    const rulesetOverrides = sanitizeRulesetOverrides(
      args.rulesetOverrides as RulesetOverrides | undefined,
    );
    resolveRulesetFromOverrides(args.teamModeEnabled ?? false, rulesetOverrides);
    const timingMode = (args.timingMode ?? "realtime") as GameTimingMode;
    const excludeWeekends =
      isAsyncTimingMode(timingMode) ? (args.excludeWeekends ?? false) : false;
    const teamModeEnabled = args.teamModeEnabled ?? false;
    const teamIds = teamModeEnabled ? getTeamIds(2) : [];
    const teamNames = teamModeEnabled ? resolveTeamNames(teamIds) : undefined;

    const gameId = await ctx.db.insert("games", {
      name: args.name,
      mapId: args.mapId,
      status: "lobby",
      visibility: args.visibility ?? DEFAULT_GAME_VISIBILITY,
      timingMode,
      excludeWeekends,
      maxPlayers,
      teamModeEnabled,
      teamCount: teamModeEnabled ? 2 : undefined,
      teamNames,
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
    const code = await generateUniqueInviteCode(async (candidateCode) => {
      const existing = await ctx.db
        .query("gameInvites")
        .withIndex("by_code", (q) => q.eq("code", candidateCode))
        .unique();
      return existing !== null;
    });
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

    const game = await ctx.db.get(invite.gameId);
    if (!game) throw new Error("Game not found");

    // Idempotent join: existing players can always resolve invite links.
    const existing = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId_userId", (q) =>
        q.eq("gameId", invite.gameId).eq("userId", String(user._id)),
      )
      .unique();
    if (existing) {
      return { gameId: invite.gameId };
    }

    if (invite.expiresAt && invite.expiresAt < Date.now()) {
      throw new Error("Invite code has expired");
    }
    if (game.status !== "lobby") throw new Error("Game is not in lobby");

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

export const deleteGame = mutation({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, { gameId }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Only lobby games can be deleted");
    if (game.createdBy !== String(user._id)) {
      throw new Error("Only the host can delete this game");
    }

    const [players, invites, actions, chatMessages] = await Promise.all([
      ctx.db
        .query("gamePlayers")
        .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
        .collect(),
      ctx.db
        .query("gameInvites")
        .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
        .collect(),
      ctx.db
        .query("gameActions")
        .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
        .collect(),
      ctx.db
        .query("gameChatMessages")
        .withIndex("by_gameId_createdAt", (q) => q.eq("gameId", gameId))
        .collect(),
    ]);

    for (const player of players) {
      await ctx.db.delete(player._id);
    }
    for (const invite of invites) {
      await ctx.db.delete(invite._id);
    }
    for (const action of actions) {
      await ctx.db.delete(action._id);
    }
    for (const message of chatMessages) {
      await ctx.db.delete(message._id);
    }

    await ctx.db.delete(gameId);
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
    const teamCount = resolveLobbyTeamCount(game, players.length);
    const teamIds = teamCount > 0 ? getTeamIds(teamCount) : [];
    const teamNames = resolveTeamNames(teamIds, game.teamNames as Record<string, string> | undefined);

    return {
      game: {
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
        createdBy: game.createdBy,
        createdAt: game.createdAt,
        startedAt: game.startedAt ?? null,
        teamModeEnabled: game.teamModeEnabled ?? false,
        teamCount: game.teamModeEnabled ? teamCount : null,
        teamNames: game.teamModeEnabled ? teamNames : null,
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
    teamId: v.string(),
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

    const playerDocs = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();
    const teamCount = resolveLobbyTeamCount(game, playerDocs.length);
    const teamIds = getTeamIds(teamCount);
    if (!teamIds.includes(teamId)) {
      throw new Error("Invalid team id");
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
    const teamCount = resolveLobbyTeamCount(game, playerDocs.length);

    const assignments = createBalancedTeamAssignments(
      playerDocs.map((playerDoc) => playerDoc.userId),
      teamCount,
      `${gameId}:lobby-teams`,
    );

    for (const playerDoc of playerDocs) {
      await ctx.db.patch(playerDoc._id, {
        teamId: assignments[playerDoc.userId]!,
      });
    }
  },
});

export const reassignPlayerColors = mutation({
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
      throw new Error("Only the host can reassign player colors");
    }

    const playerDocs = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();

    const teamIdByUserId: Record<string, string | undefined> = Object.fromEntries(
      playerDocs.map((playerDoc) => [playerDoc.userId, playerDoc.teamId]),
    );
    const nextColors = game.teamModeEnabled
      ? resolveTeamAwarePlayerColors(playerDocs, teamIdByUserId)
      : resolvePlayerColors(playerDocs);

    for (const playerDoc of playerDocs) {
      await ctx.db.patch(playerDoc._id, {
        color: nextColors[playerDoc.userId]!,
      });
    }
  },
});

export const setTeamCount = mutation({
  args: {
    gameId: v.id("games"),
    teamCount: v.number(),
  },
  handler: async (ctx, { gameId, teamCount }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    if (!Number.isInteger(teamCount)) throw new Error("teamCount must be an integer");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");
    if (game.createdBy !== String(user._id)) {
      throw new Error("Only the host can update team count");
    }
    if (!game.teamModeEnabled) {
      throw new Error("Team mode is not enabled for this game");
    }

    const playerDocs = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();
    const maxTeams = Math.max(2, playerDocs.length);
    if (teamCount < 2 || teamCount > maxTeams) {
      throw new Error(`Team count must be between 2 and ${maxTeams}`);
    }

    const teamIds = getTeamIds(teamCount);
    const teamNames = resolveTeamNames(teamIds, game.teamNames as Record<string, string> | undefined);

    await ctx.db.patch(gameId, {
      teamCount,
      teamNames,
    });

    for (const playerDoc of playerDocs) {
      if (playerDoc.teamId && !teamIds.includes(playerDoc.teamId)) {
        await ctx.db.patch(playerDoc._id, { teamId: undefined });
      }
    }
  },
});

export const setTeamName = mutation({
  args: {
    gameId: v.id("games"),
    teamId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { gameId, teamId, name }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");
    if (game.createdBy !== String(user._id)) {
      throw new Error("Only the host can rename teams");
    }
    if (!game.teamModeEnabled) {
      throw new Error("Team mode is not enabled for this game");
    }

    const playerDocs = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();
    const teamCount = resolveLobbyTeamCount(game, playerDocs.length);
    const teamIds = getTeamIds(teamCount);
    if (!teamIds.includes(teamId)) {
      throw new Error("Invalid team id");
    }

    const teamNames = resolveTeamNames(teamIds, game.teamNames as Record<string, string> | undefined);
    validateTeamNameUniqueness(teamId, name, teamNames);
    teamNames[teamId] = name.trim();

    await ctx.db.patch(gameId, { teamNames });
  },
});

export const setRulesetOverrides = mutation({
  args: {
    gameId: v.id("games"),
    rulesetOverrides: v.optional(rulesetOverridesValidator),
    timingMode: v.optional(
      v.union(v.literal("realtime"), v.literal("async_1d"), v.literal("async_3d")),
    ),
    excludeWeekends: v.optional(v.boolean()),
  },
  handler: async (ctx, { gameId, rulesetOverrides, timingMode, excludeWeekends }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "lobby") throw new Error("Game is not in lobby");
    if (game.createdBy !== String(user._id)) {
      throw new Error("Only the host can update game rules");
    }

    const sanitized = sanitizeRulesetOverrides(
      rulesetOverrides as RulesetOverrides | undefined,
    );
    const effectiveRuleset = resolveRulesetFromOverrides(
      game.teamModeEnabled ?? false,
      sanitized,
    );
    const nextTimingMode = (timingMode ?? game.timingMode ?? "realtime") as GameTimingMode;
    const nextExcludeWeekends = isAsyncTimingMode(nextTimingMode)
      ? (excludeWeekends ?? game.excludeWeekends ?? false)
      : false;

    await ctx.db.patch(gameId, {
      rulesetOverrides: sanitized,
      effectiveRuleset: toStoredRuleset(effectiveRuleset),
      timingMode: nextTimingMode,
      excludeWeekends: nextExcludeWeekends,
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

    const graphMap = readGraphMap(mapDoc.graphMap);
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

    let teamAssignmentsByUserId: Record<string, string | undefined> = {};
    if (teamMode.enabled) {
      const teamCount = resolveLobbyTeamCount(game, playerDocs.length);
      const teamIds = getTeamIds(teamCount);
      if (teamMode.assignmentStrategy === "balancedRandom") {
        teamAssignmentsByUserId = createBalancedTeamAssignments(
          playerDocs.map((playerDoc) => playerDoc.userId),
          teamCount,
          `${gameId}:start-teams`,
        );
      } else {
        teamAssignmentsByUserId = Object.fromEntries(
          playerDocs.map((playerDoc) => [playerDoc.userId, playerDoc.teamId]),
        );
      }
      const assignmentErrors = validateTeamAssignments(
        playerDocs.map((playerDoc) => playerDoc.userId),
        teamAssignmentsByUserId,
        teamIds,
      );
      if (assignmentErrors.length > 0) {
        throw new Error(assignmentErrors[0]);
      }
    }

    // Seed the RNG
    const seed = `${gameId}-${Date.now()}`;
    const rng = createRng({ seed, index: 0 });

    // Shuffle turn order (team-aware interleaving in team mode)
    const playerTeamIdsByPlayerId: Record<string, string | undefined> = {};
    for (let i = 0; i < playerIds.length; i += 1) {
      const playerDoc = playerDocs[i]!;
      playerTeamIdsByPlayerId[playerIds[i]!] = teamMode.enabled
        ? teamAssignmentsByUserId[playerDoc.userId]
        : undefined;
    }
    const turnOrder = teamMode.enabled
      ? createTeamAwareTurnOrder(playerIds, playerTeamIdsByPlayerId, rng)
      : rng.shuffle(playerIds);

    // Shuffle territories for assignment
    const shuffledTerritories = rng.shuffle(territoryIds);

    // Determine initial armies per player
    const playerCount = playerIds.length;
    const initialArmies = resolveInitialArmies(
      setup,
      playerCount,
      territoryIds.length,
      setup.neutralTerritoryCount,
    );

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

    // Distribute remaining armies randomly with a per-territory cap
    for (const pid of turnOrder) {
      const owned = playerTerritoryAssignments[pid]!;
      distributeInitialArmiesCappedRandom(rng, owned, territories, initialArmies, 4);
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
      turnOrder,
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
    const turnStartedAt = Date.now();
    const turnDeadlineAt = computeTurnDeadlineAt(
      turnStartedAt,
      (game.timingMode ?? "realtime") as GameTimingMode,
      game.excludeWeekends ?? false,
    );
    await ctx.db.patch(gameId, {
      status: "active",
      startedAt: Date.now(),
      initialState: engineState,
      state: engineState,
      stateVersion: 1,
      effectiveRuleset: toStoredRuleset(effectiveRuleset),
      turnStartedAt,
      turnDeadlineAt: turnDeadlineAt ?? undefined,
    });

    if (isAsyncTimingMode((game.timingMode ?? "realtime") as GameTimingMode)) {
      await ctx.scheduler.runAfter(0, internal.asyncTurns.sendYourTurnEmail, {
        gameId,
        expectedPlayerId: engineState.turn.currentPlayerId,
        turnStartedAt,
      });
    }

    return { gameId };
  },
});
