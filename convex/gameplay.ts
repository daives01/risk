import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authComponent } from "./auth.js";
import {
  applyAction,
  ActionError,
  calculateReinforcements,
} from "risk-engine";
import type { Action, CardId, GameState, PlayerId, GraphMap, TerritoryId, RulesetConfig } from "risk-engine";
import { resolveEffectiveRuleset, type RulesetOverrides } from "./rulesets";
import { computeTurnDeadlineAt, didTurnAdvance, isAsyncTimingMode, type GameTimingMode } from "./gameTiming";
import { readGraphMap } from "./typeAdapters";
import { scheduleTurnTimeout } from "./turnTimeoutScheduling";
import { buildTimelineStatePatch } from "./historyTimeline";
import {
  GAME_STATE_SNAPSHOT_INTERVAL,
  insertGameStateSnapshotIfMissing,
  publicGameStateProjection,
  readCurrentPrivateGameState,
  upsertCurrentGameState,
} from "./gameState";

const actionValidator = v.union(
  v.object({
    type: v.literal("TradeCards"),
    cardIds: v.array(v.string()),
  }),
  v.object({
    type: v.literal("PlaceReinforcements"),
    territoryId: v.string(),
    count: v.number(),
  }),
  v.object({
    type: v.literal("Attack"),
    from: v.string(),
    to: v.string(),
    attackerDice: v.optional(v.number()),
  }),
  v.object({
    type: v.literal("Occupy"),
    moveArmies: v.number(),
  }),
  v.object({
    type: v.literal("Fortify"),
    from: v.string(),
    to: v.string(),
    count: v.number(),
  }),
  v.object({
    type: v.literal("EndAttackPhase"),
  }),
  v.object({
    type: v.literal("EndTurn"),
  }),
);

function getGameRuleset(game: {
  teamModeEnabled?: boolean;
  rulesetOverrides?: RulesetOverrides;
  effectiveRuleset?: RulesetConfig;
}): RulesetConfig {
  return resolveEffectiveRuleset(game);
}

export function resolveTurnTimingPatch(args: {
  timingMode: GameTimingMode;
  excludeWeekends: boolean;
  previousState: GameState;
  nextState: GameState;
  now: number;
  currentTurnStartedAt?: number;
  currentTurnDeadlineAt?: number;
}) {
  const isGameOver = args.nextState.turn.phase === "GameOver";
  if (!isAsyncTimingMode(args.timingMode) || isGameOver) {
    return {
      turnStartedAt: undefined as number | undefined,
      turnDeadlineAt: undefined as number | undefined,
      shouldNotify: false,
    };
  }
  if (!didTurnAdvance(args.previousState, args.nextState)) {
    return {
      turnStartedAt: args.currentTurnStartedAt,
      turnDeadlineAt: args.currentTurnDeadlineAt,
      shouldNotify: false,
    };
  }

  const turnStartedAt = args.now;
  return {
    turnStartedAt,
    turnDeadlineAt:
      computeTurnDeadlineAt(turnStartedAt, args.timingMode, args.excludeWeekends) ??
      undefined,
    shouldNotify: true,
  };
}

function assertTurnNotExpired(game: {
  timingMode?: GameTimingMode;
  turnDeadlineAt?: number;
}) {
  const timingMode = (game.timingMode ?? "realtime") as GameTimingMode;
  if (!isAsyncTimingMode(timingMode)) return;
  if (!game.turnDeadlineAt) return;
  if (Date.now() <= game.turnDeadlineAt) return;
  throw new Error("This turn has timed out and will be advanced automatically.");
}

function extractGameWinner(events: unknown[]): {
  winningPlayerId?: string;
  winningTeamId?: string;
} {
  const gameEnded = events.find(
    (event): event is { type: "GameEnded"; winningPlayerId?: unknown; winningTeamId?: unknown } =>
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      (event as { type?: unknown }).type === "GameEnded",
  );
  if (!gameEnded) return {};

  return {
    ...(typeof gameEnded.winningPlayerId === "string"
      ? { winningPlayerId: gameEnded.winningPlayerId }
      : {}),
    ...(typeof gameEnded.winningTeamId === "string"
      ? { winningTeamId: gameEnded.winningTeamId }
      : {}),
  };
}

function extractEliminationNotificationData(events: unknown[]): {
  eliminatedPlayerIds: string[];
  byPlayerId?: string;
} {
  const eliminationEvents = events.filter(
    (event): event is { type: "PlayerEliminated"; eliminatedId?: unknown; byId?: unknown } =>
      typeof event === "object" &&
      event !== null &&
      "type" in event &&
      (event as { type?: unknown }).type === "PlayerEliminated" &&
      typeof (event as { eliminatedId?: unknown }).eliminatedId === "string",
  );

  return {
    eliminatedPlayerIds: eliminationEvents.map((event) => event.eliminatedId as string),
    ...(typeof eliminationEvents[0]?.byId === "string"
      ? { byPlayerId: eliminationEvents[0].byId as string }
      : {}),
  };
}

type DelegationPlayerDoc = {
  enginePlayerId?: string;
  teamId?: string;
  allowTeammatesToAct?: boolean;
};

export function resolveActingPlayerFromDocs(args: {
  requestedPlayerId?: string;
  callerId: string;
  callerPlayer: DelegationPlayerDoc | null;
  targetPlayer?: DelegationPlayerDoc | null;
  targetAllowsDelegation?: boolean;
  game: { teamModeEnabled?: boolean };
  state: GameState;
}) {
  if (!args.callerPlayer?.enginePlayerId) {
    throw new Error("You are not a player in this game");
  }

  const requestedPlayerId = args.requestedPlayerId ?? args.callerPlayer.enginePlayerId;
  if (requestedPlayerId === args.callerPlayer.enginePlayerId) {
    return {
      playerId: args.callerPlayer.enginePlayerId as PlayerId,
      actingUserId: args.callerId,
      wasDelegated: false,
    };
  }

  if (!args.game.teamModeEnabled) throw new Error("Turn delegation is only available in team games");
  if (args.state.turn.currentPlayerId !== requestedPlayerId) {
    throw new Error("You can only play for the active turn owner");
  }
  if (args.state.players[requestedPlayerId]?.status !== "alive") {
    throw new Error("You can only play for an alive teammate");
  }
  if (!args.callerPlayer.teamId) throw new Error("You are not assigned to a team");
  if (!args.targetPlayer?.enginePlayerId) {
    throw new Error("Delegated player not found");
  }
  if (args.targetAllowsDelegation !== true) {
    throw new Error("This teammate has not allowed delegated turns");
  }
  if (!args.targetPlayer.teamId || args.targetPlayer.teamId !== args.callerPlayer.teamId) {
    throw new Error("You can only play for a teammate");
  }

  return {
    playerId: args.targetPlayer.enginePlayerId as PlayerId,
    actingUserId: args.callerId,
    wasDelegated: true,
  };
}

async function resolveActingPlayer(ctx: MutationCtx, args: {
  gameId: Id<"games">;
  requestedPlayerId?: string;
  callerId: string;
  game: { teamModeEnabled?: boolean };
  state: GameState;
}) {
  const callerPlayer = await ctx.db
    .query("gamePlayers")
    .withIndex("by_gameId_userId", (q) =>
      q.eq("gameId", args.gameId).eq("userId", args.callerId),
    )
    .unique();
  const requestedPlayerId = args.requestedPlayerId ?? callerPlayer?.enginePlayerId;
  const targetPlayer = requestedPlayerId && requestedPlayerId !== callerPlayer?.enginePlayerId
    ? await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .filter((q) => q.eq(q.field("enginePlayerId"), requestedPlayerId))
      .unique()
    : null;
  return resolveActingPlayerFromDocs({
    requestedPlayerId: args.requestedPlayerId,
    callerId: args.callerId,
    callerPlayer,
    targetPlayer,
    targetAllowsDelegation: targetPlayer?.allowTeammatesToAct ?? false,
    game: args.game,
    state: args.state,
  });
}

export const submitAction = mutation({
  args: {
    gameId: v.id("games"),
    expectedVersion: v.number(),
    action: actionValidator,
    delegatedPlayerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "active") throw new Error("Game is not active");
    assertTurnNotExpired({
      timingMode: game.timingMode as GameTimingMode | undefined,
      turnDeadlineAt: game.turnDeadlineAt ?? undefined,
    });

    const state = await readCurrentPrivateGameState(ctx, game);
    if (!state) throw new Error("Game has no state");
    const ruleset = getGameRuleset({
      teamModeEnabled: game.teamModeEnabled,
      rulesetOverrides: game.rulesetOverrides as RulesetOverrides | undefined,
      effectiveRuleset: game.effectiveRuleset as RulesetConfig | undefined,
    });

    // Optimistic concurrency check
    if (state.stateVersion !== args.expectedVersion) {
      throw new Error(
        `Version mismatch: expected ${args.expectedVersion}, current ${state.stateVersion}`,
      );
    }

    const callerId = String(user._id);
    const actingPlayer = await resolveActingPlayer(ctx, {
      gameId: args.gameId,
      requestedPlayerId: args.delegatedPlayerId,
      callerId,
      game,
      state,
    });
    const playerId = actingPlayer.playerId;

    // Fetch map for actions that need it
    const mapDoc = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", game.mapId))
      .unique();
    if (!mapDoc) throw new Error("Map not found");
    const graphMap = readGraphMap(mapDoc.graphMap);

    // Apply the action through the engine
    const action = args.action as Action;
    let result;
    try {
      result = applyAction(
        state,
        playerId,
        action,
        graphMap,
        ruleset.combat,
        ruleset.fortify,
        ruleset.cards,
        ruleset.teams,
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

    const createdAt = Date.now();
    // Append to action log
    await ctx.db.insert("gameActions", {
      gameId: args.gameId,
      index: nextIndex,
      playerId,
      action: args.action,
      events: result.events,
      publicStatePatch: buildTimelineStatePatch(
        publicGameStateProjection(state),
        publicGameStateProjection(result.state),
      ),
      actingUserId: actingPlayer.actingUserId,
      wasDelegated: actingPlayer.wasDelegated,
      stateVersionBefore: state.stateVersion,
      stateVersionAfter: result.state.stateVersion,
      createdAt,
    });
    await insertGameStateSnapshotIfMissing(ctx, {
      gameId: args.gameId,
      index: nextIndex,
      state: result.state,
      createdAt,
    });

    // Check if game is over
    const isGameOver = result.state.turn.phase === "GameOver";
    const winner = isGameOver ? extractGameWinner(result.events as unknown[]) : {};
    const now = Date.now();
    const timingPatch = resolveTurnTimingPatch({
      timingMode: (game.timingMode ?? "realtime") as GameTimingMode,
      excludeWeekends: game.excludeWeekends ?? false,
      previousState: state,
      nextState: result.state,
      now,
      currentTurnStartedAt: game.turnStartedAt ?? undefined,
      currentTurnDeadlineAt: game.turnDeadlineAt ?? undefined,
    });
    const turnTimeoutJobId = await scheduleTurnTimeout({
      scheduler: ctx.scheduler,
      currentJobId: game.turnTimeoutJobId,
      gameId: args.gameId,
      turnDeadlineAt: timingPatch.turnDeadlineAt,
      turnStartedAt: timingPatch.turnStartedAt,
      expectedPlayerId: timingPatch.turnStartedAt ? result.state.turn.currentPlayerId : undefined,
    });

    // Persist new state
    await upsertCurrentGameState(ctx, {
      gameId: args.gameId,
      state: result.state,
      updatedAt: now,
    });
    await ctx.db.patch(args.gameId, {
      turnStartedAt: timingPatch.turnStartedAt,
      turnDeadlineAt: timingPatch.turnDeadlineAt,
      turnTimeoutJobId,
      ...(isGameOver
        ? {
            status: "finished" as const,
            finishedAt: now,
            ...winner,
          }
        : {}),
    });

    if (timingPatch.shouldNotify && timingPatch.turnStartedAt) {
      await ctx.scheduler.runAfter(0, (internal as any).turnNotifications.sendTurnNotifications, {
        gameId: args.gameId,
        expectedPlayerId: result.state.turn.currentPlayerId,
        turnStartedAt: timingPatch.turnStartedAt,
      });
    }

    const eliminationNotification = extractEliminationNotificationData(result.events as unknown[]);
    if (eliminationNotification.eliminatedPlayerIds.length > 0) {
      await ctx.scheduler.runAfter(0, (internal as any).eliminationNotifications.sendEliminationNotifications, {
        gameId: args.gameId,
        eliminatedPlayerIds: eliminationNotification.eliminatedPlayerIds,
        byPlayerId: eliminationNotification.byPlayerId,
      });
    }

    return {
      events: result.events,
      newVersion: result.state.stateVersion,
    };
  },
});

export const submitReinforcementPlacements = mutation({
  args: {
    gameId: v.id("games"),
    expectedVersion: v.number(),
    delegatedPlayerId: v.optional(v.string()),
    placements: v.array(v.object({
      territoryId: v.string(),
      count: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "active") throw new Error("Game is not active");
    assertTurnNotExpired({
      timingMode: game.timingMode as GameTimingMode | undefined,
      turnDeadlineAt: game.turnDeadlineAt ?? undefined,
    });
    if (args.placements.length === 0) throw new Error("No placements to submit");

    const state = await readCurrentPrivateGameState(ctx, game);
    if (!state) throw new Error("Game has no state");
    const ruleset = getGameRuleset({
      teamModeEnabled: game.teamModeEnabled,
      rulesetOverrides: game.rulesetOverrides as RulesetOverrides | undefined,
      effectiveRuleset: game.effectiveRuleset as RulesetConfig | undefined,
    });
    if (state.stateVersion !== args.expectedVersion) {
      throw new Error(
        `Version mismatch: expected ${args.expectedVersion}, current ${state.stateVersion}`,
      );
    }

    const callerId = String(user._id);
    const actingPlayer = await resolveActingPlayer(ctx, {
      gameId: args.gameId,
      requestedPlayerId: args.delegatedPlayerId,
      callerId,
      game,
      state,
    });
    const playerId = actingPlayer.playerId;

    const mapDoc = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", game.mapId))
      .unique();
    if (!mapDoc) throw new Error("Map not found");
    const graphMap = readGraphMap(mapDoc.graphMap);

    let nextState = state;
    const events: unknown[] = [];

    for (const placement of args.placements) {
      const count = Math.trunc(placement.count);
      if (!Number.isFinite(count) || count < 1) {
        throw new Error("Each placement count must be a positive integer");
      }

      const action: Action = {
        type: "PlaceReinforcements",
        territoryId: placement.territoryId as TerritoryId,
        count,
      };

      let result;
      try {
        result = applyAction(
          nextState,
          playerId,
          action,
          graphMap,
          ruleset.combat,
          ruleset.fortify,
          ruleset.cards,
          ruleset.teams,
        );
      } catch (e) {
        if (e instanceof ActionError) {
          throw new Error(e.message);
        }
        throw e;
      }

      nextState = result.state;
      events.push(...result.events);
    }

    const lastAction = await ctx.db
      .query("gameActions")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", args.gameId))
      .order("desc")
      .first();
    const nextIndex = lastAction ? lastAction.index + 1 : 0;

    const action = { type: "PlaceReinforcementsBatch", placements: args.placements };
    const createdAt = Date.now();
    await ctx.db.insert("gameActions", {
      gameId: args.gameId,
      index: nextIndex,
      playerId,
      action,
      events,
      publicStatePatch: buildTimelineStatePatch(
        publicGameStateProjection(state),
        publicGameStateProjection(nextState),
      ),
      actingUserId: actingPlayer.actingUserId,
      wasDelegated: actingPlayer.wasDelegated,
      stateVersionBefore: state.stateVersion,
      stateVersionAfter: nextState.stateVersion,
      createdAt,
    });
    await insertGameStateSnapshotIfMissing(ctx, {
      gameId: args.gameId,
      index: nextIndex,
      state: nextState,
      createdAt,
    });

    const isGameOver = nextState.turn.phase === "GameOver";
    const winner = isGameOver ? extractGameWinner(events) : {};
    const now = Date.now();
    const timingPatch = resolveTurnTimingPatch({
      timingMode: (game.timingMode ?? "realtime") as GameTimingMode,
      excludeWeekends: game.excludeWeekends ?? false,
      previousState: state,
      nextState,
      now,
      currentTurnStartedAt: game.turnStartedAt ?? undefined,
      currentTurnDeadlineAt: game.turnDeadlineAt ?? undefined,
    });
    const turnTimeoutJobId = await scheduleTurnTimeout({
      scheduler: ctx.scheduler,
      currentJobId: game.turnTimeoutJobId,
      gameId: args.gameId,
      turnDeadlineAt: timingPatch.turnDeadlineAt,
      turnStartedAt: timingPatch.turnStartedAt,
      expectedPlayerId: timingPatch.turnStartedAt ? nextState.turn.currentPlayerId : undefined,
    });

    await upsertCurrentGameState(ctx, {
      gameId: args.gameId,
      state: nextState,
      updatedAt: now,
    });
    await ctx.db.patch(args.gameId, {
      turnStartedAt: timingPatch.turnStartedAt,
      turnDeadlineAt: timingPatch.turnDeadlineAt,
      turnTimeoutJobId,
      ...(isGameOver
        ? {
            status: "finished" as const,
            finishedAt: now,
            ...winner,
          }
        : {}),
    });

    if (timingPatch.shouldNotify && timingPatch.turnStartedAt) {
      await ctx.scheduler.runAfter(0, (internal as any).turnNotifications.sendTurnNotifications, {
        gameId: args.gameId,
        expectedPlayerId: nextState.turn.currentPlayerId,
        turnStartedAt: timingPatch.turnStartedAt,
      });
    }

    const eliminationNotification = extractEliminationNotificationData(events);
    if (eliminationNotification.eliminatedPlayerIds.length > 0) {
      await ctx.scheduler.runAfter(0, (internal as any).eliminationNotifications.sendEliminationNotifications, {
        gameId: args.gameId,
        eliminatedPlayerIds: eliminationNotification.eliminatedPlayerIds,
        byPlayerId: eliminationNotification.byPlayerId,
      });
    }

    return {
      events,
      newVersion: nextState.stateVersion,
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

  const state = await readCurrentPrivateGameState(ctx, game);
    if (!state) throw new Error("Game has no state");
    const ruleset = getGameRuleset({
      teamModeEnabled: game.teamModeEnabled,
      rulesetOverrides: game.rulesetOverrides as RulesetOverrides | undefined,
      effectiveRuleset: game.effectiveRuleset as RulesetConfig | undefined,
    });

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

    // Check if only 1 alive player/team remains
    const alivePlayers = state.turnOrder.filter(
      (pid) => newPlayers[pid]!.status === "alive",
    );
    const aliveTeams = new Set(
      alivePlayers.map((pid) => newPlayers[pid]!.teamId ?? `solo:${pid}`),
    );
    const isGameOver = ruleset.teams.teamsEnabled ? aliveTeams.size <= 1 : alivePlayers.length <= 1;

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
      const graphMap = readGraphMap(mapDoc!.graphMap);

      const reinforcementResult = calculateReinforcements(
        { territories: newTerritories, players: newPlayers } as GameState,
        nextPlayerId,
        graphMap,
        ruleset.teams,
        state.turnOrder,
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
      ...(isGameOver
        ? [{
            type: "GameEnded",
            ...(ruleset.teams.teamsEnabled
              ? { winningTeamId: alivePlayers[0] ? newPlayers[alivePlayers[0]]!.teamId : undefined }
              : { winningPlayerId: alivePlayers[0] }),
          }]
        : []),
    ];
    const winner = isGameOver ? extractGameWinner(events) : {};
    const now = Date.now();
    const timingPatch = resolveTurnTimingPatch({
      timingMode: (game.timingMode ?? "realtime") as GameTimingMode,
      excludeWeekends: game.excludeWeekends ?? false,
      previousState: state,
      nextState: newState,
      now,
      currentTurnStartedAt: game.turnStartedAt ?? undefined,
      currentTurnDeadlineAt: game.turnDeadlineAt ?? undefined,
    });
    const turnTimeoutJobId = await scheduleTurnTimeout({
      scheduler: ctx.scheduler,
      currentJobId: game.turnTimeoutJobId,
      gameId,
      turnDeadlineAt: timingPatch.turnDeadlineAt,
      turnStartedAt: timingPatch.turnStartedAt,
      expectedPlayerId: timingPatch.turnStartedAt ? newState.turn.currentPlayerId : undefined,
    });

    const action = { type: "Resign" };
    const createdAt = Date.now();
    await ctx.db.insert("gameActions", {
      gameId,
      index: nextIndex,
      playerId,
      action,
      events,
      publicStatePatch: buildTimelineStatePatch(
        publicGameStateProjection(state),
        publicGameStateProjection(newState),
      ),
      stateVersionBefore: state.stateVersion,
      stateVersionAfter: newState.stateVersion,
      createdAt,
    });
    await insertGameStateSnapshotIfMissing(ctx, {
      gameId,
      index: nextIndex,
      state: newState,
      createdAt,
    });

    await upsertCurrentGameState(ctx, {
      gameId,
      state: newState,
      updatedAt: now,
    });
    await ctx.db.patch(gameId, {
      turnStartedAt: timingPatch.turnStartedAt,
      turnDeadlineAt: timingPatch.turnDeadlineAt,
      turnTimeoutJobId,
      ...(isGameOver
        ? {
            status: "finished" as const,
            finishedAt: now,
            ...winner,
          }
        : {}),
    });

    if (timingPatch.shouldNotify && timingPatch.turnStartedAt) {
      await ctx.scheduler.runAfter(0, (internal as any).turnNotifications.sendTurnNotifications, {
        gameId,
        expectedPlayerId: newState.turn.currentPlayerId,
        turnStartedAt: timingPatch.turnStartedAt,
      });
    }

    await ctx.scheduler.runAfter(0, (internal as any).eliminationNotifications.sendEliminationNotifications, {
      gameId,
      eliminatedPlayerIds: [playerId],
      byPlayerId: playerId,
    });

    return { events, newVersion: newState.stateVersion };
  },
});

type RawEvent = Record<string, unknown>;

function redactEvents(events: RawEvent[]): RawEvent[] {
  return events.map((e) => {
    switch (e.type) {
      case "CardDrawn":
        return { type: e.type, playerId: e.playerId };
      case "CardsTraded":
        return { type: e.type, playerId: e.playerId, value: e.value, tradesCompletedAfter: e.tradesCompletedAfter };
      case "PlayerEliminated":
        return { type: e.type, eliminatedId: e.eliminatedId, byId: e.byId, cardsTransferredCount: Array.isArray(e.cardsTransferred) ? e.cardsTransferred.length : 0 };
      default:
        return e;
    }
  });
}

function redactAction(action: Record<string, unknown>): Record<string, unknown> {
  if (action.type === "TradeCards") {
    return { type: action.type };
  }
  return action;
}

export const listRecentActions = query({
  args: {
    gameId: v.id("games"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { gameId, limit }) => {
    const take = limit ?? 20;
    const actions = await ctx.db
      .query("gameActions")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId))
      .order("desc")
      .take(take);
    return actions.reverse().map((a) => ({
      _id: a._id,
      _creationTime: a._creationTime,
      gameId: a.gameId,
      index: a.index,
      playerId: a.playerId,
      action: redactAction(a.action as Record<string, unknown>),
      events: redactEvents(a.events as RawEvent[]),
      createdAt: a.createdAt,
    }));
  },
});

export const listActions = query({
  args: {
    gameId: v.id("games"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { gameId, limit }) => {
    const actions = await ctx.db
      .query("gameActions")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId))
      .order("desc")
      .take(limit ?? 50);
    return actions.reverse().map((a) => ({
      _id: a._id,
      _creationTime: a._creationTime,
      gameId: a.gameId,
      index: a.index,
      playerId: a.playerId,
      action: redactAction(a.action as Record<string, unknown>),
      events: redactEvents(a.events as RawEvent[]),
      createdAt: a.createdAt,
    }));
  },
});

export const getHistorySummary = query({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, { gameId }) => {
    const latestAction = await ctx.db
      .query("gameActions")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId))
      .order("desc")
      .first();

    return {
      latestActionIndex: latestAction?.index ?? null,
    };
  },
});

export function applyResignStateTransition(
  state: GameState,
  playerId: PlayerId,
  graphMap: GraphMap,
  ruleset: RulesetConfig,
): GameState {
  const playerState = state.players[playerId];
  if (!playerState || playerState.status !== "alive") return state;

  const newPlayers = {
    ...state.players,
    [playerId]: { ...playerState, status: "defeated" as const },
  };

  const newTerritories = { ...state.territories };
  for (const [tid, territory] of Object.entries(newTerritories)) {
    if (territory.ownerId === playerId) {
      newTerritories[tid] = { ...territory, ownerId: "neutral" };
    }
  }

  const resignerCards = state.hands[playerId] ?? [];
  const newHands = { ...state.hands, [playerId]: [] as readonly CardId[] };
  const newDeck = {
    ...state.deck,
    discard: [...state.deck.discard, ...resignerCards],
  };

  const alivePlayers = state.turnOrder.filter((pid) => newPlayers[pid]!.status === "alive");
  const aliveTeams = new Set(alivePlayers.map((pid) => newPlayers[pid]!.teamId ?? `solo:${pid}`));
  const isGameOver = ruleset.teams.teamsEnabled ? aliveTeams.size <= 1 : alivePlayers.length <= 1;

  let newTurn = state.turn;
  let newReinforcements = state.reinforcements;
  let newCapturedThisTurn = state.capturedThisTurn;

  if (isGameOver) {
    newTurn = { ...state.turn, phase: "GameOver" };
  } else if (state.turn.currentPlayerId === playerId) {
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
    const reinforcementResult = calculateReinforcements(
      { territories: newTerritories, players: newPlayers } as GameState,
      nextPlayerId,
      graphMap,
      ruleset.teams,
      state.turnOrder,
    );

    newTurn = {
      currentPlayerId: nextPlayerId,
      phase: "Reinforcement",
      round: newRound,
    };
    newReinforcements = {
      remaining: reinforcementResult.total,
      sources: reinforcementResult.sources,
    };
    newCapturedThisTurn = false;
  }

  return {
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
}

export const getHistoryWindow = query({
  args: {
    gameId: v.id("games"),
    beforeIndex: v.optional(v.number()),
  },
  handler: async (ctx, { gameId, beforeIndex }) => {
    if (typeof beforeIndex === "number" && beforeIndex <= 0) {
      const startSnapshot = await ctx.db
        .query("gameStateSnapshots")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId).eq("index", -1))
        .unique();
      const latestAction = await ctx.db
        .query("gameActions")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId))
        .order("desc")
        .first();
      return {
        latestIndex: latestAction?.index ?? -1,
        snapshotIndex: startSnapshot?.index ?? null,
        snapshotPublicState: startSnapshot?.publicState ?? null,
        actions: [],
        hasPrevious: false,
      };
    }

    const latestAction = await ctx.db
      .query("gameActions")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId))
      .order("desc")
      .first();
    const latestIndex = latestAction?.index ?? -1;
    if (latestIndex < 0) {
      const startSnapshot = await ctx.db
        .query("gameStateSnapshots")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId).eq("index", -1))
        .unique();
      return {
        latestIndex,
        snapshotIndex: startSnapshot?.index ?? null,
        snapshotPublicState: startSnapshot?.publicState ?? null,
        actions: [],
        hasPrevious: false,
      };
    }

    const rawWindowEnd =
      typeof beforeIndex === "number" && Number.isFinite(beforeIndex)
        ? Math.min(latestIndex, Math.floor(beforeIndex) - 1)
        : latestIndex;
    const windowEnd = Math.max(0, rawWindowEnd);
    const targetSnapshotIndex =
      Math.floor(windowEnd / GAME_STATE_SNAPSHOT_INTERVAL) * GAME_STATE_SNAPSHOT_INTERVAL;

    let snapshot = await ctx.db
      .query("gameStateSnapshots")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId).eq("index", targetSnapshotIndex))
      .unique();
    if (!snapshot) {
      snapshot = await ctx.db
        .query("gameStateSnapshots")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId).eq("index", -1))
        .unique();
    }

    const snapshotIndex = snapshot?.index ?? -1;
    const actions = await ctx.db
      .query("gameActions")
      .withIndex("by_gameId_index", (q) =>
        q.eq("gameId", gameId).gt("index", snapshotIndex).lte("index", windowEnd),
      )
      .collect();

    return {
      latestIndex,
      snapshotIndex,
      snapshotPublicState: snapshot?.publicState ?? null,
      actions: actions.map((a) => ({
        _id: a._id,
        _creationTime: a._creationTime,
        gameId: a.gameId,
        index: a.index,
        playerId: a.playerId,
        action: redactAction(a.action as Record<string, unknown>),
        events: redactEvents(a.events as RawEvent[]),
        publicStatePatch: a.publicStatePatch,
        createdAt: a.createdAt,
      })),
      hasPrevious: snapshotIndex > -1,
    };
  },
});
