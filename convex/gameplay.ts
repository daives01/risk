import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { authComponent } from "./auth.js";
import {
  applyAction,
  ActionError,
  calculateReinforcements,
  createDeck,
  createRng,
  resolveInitialArmies,
} from "risk-engine";
import type { Action, CardId, GameState, PlayerId, GraphMap, TerritoryId, GameEvent, RulesetConfig } from "risk-engine";
import { summarizeTimelineFrame } from "./historyTimeline";
import { resolveEffectiveRuleset, type RulesetOverrides } from "./rulesets";
import { computeTurnDeadlineAt, didTurnAdvance, isAsyncTimingMode, type GameTimingMode } from "./gameTiming";
import { readGameState, readGraphMap } from "./typeAdapters";
import { distributeInitialArmiesCappedRandom } from "./initialPlacement";
import { createTeamAwareTurnOrder } from "./teamTurnOrder";

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

type TimelinePublicState = {
  players: Record<string, { status: string; teamId?: string }>;
  turnOrder: string[];
  territories: Record<string, { ownerId: string; armies: number }>;
  turn: { currentPlayerId: string; phase: string; round: number };
  pending?: {
    type: "Occupy";
    from: string;
    to: string;
    minMove: number;
    maxMove: number;
  };
  reinforcements?: { remaining: number; sources?: Record<string, number> };
  capturedThisTurn: boolean;
  tradesCompleted: number;
  fortifiesUsedThisTurn?: number;
  deckCount: number;
  discardCount: number;
  handSizes: Record<string, number>;
  stateVersion: number;
};

function getGameRuleset(game: {
  teamModeEnabled?: boolean;
  rulesetOverrides?: RulesetOverrides;
  effectiveRuleset?: RulesetConfig;
}): RulesetConfig {
  return resolveEffectiveRuleset(game);
}

function resolveTurnTimingPatch(args: {
  timingMode: GameTimingMode;
  excludeWeekends: boolean;
  previousState: GameState;
  nextState: GameState;
  now: number;
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
      turnStartedAt: undefined as number | undefined,
      turnDeadlineAt: undefined as number | undefined,
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

export const submitAction = mutation({
  args: {
    gameId: v.id("games"),
    expectedVersion: v.number(),
    action: actionValidator,
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

    const state = readGameState(game.state);
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

    // Append to action log
    await ctx.db.insert("gameActions", {
      gameId: args.gameId,
      index: nextIndex,
      playerId: playerDoc.enginePlayerId,
      action: args.action,
      events: result.events,
      stateVersionBefore: state.stateVersion,
      stateVersionAfter: result.state.stateVersion,
      createdAt: Date.now(),
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
    });

    // Persist new state
    await ctx.db.patch(args.gameId, {
      state: result.state,
      stateVersion: result.state.stateVersion,
      turnStartedAt: timingPatch.turnStartedAt,
      turnDeadlineAt: timingPatch.turnDeadlineAt,
      ...(isGameOver
        ? {
            status: "finished" as const,
            finishedAt: now,
            ...winner,
          }
        : {}),
    });

    if (timingPatch.shouldNotify && timingPatch.turnStartedAt) {
      await ctx.scheduler.runAfter(0, internal.asyncTurns.sendYourTurnEmail, {
        gameId: args.gameId,
        expectedPlayerId: result.state.turn.currentPlayerId,
        turnStartedAt: timingPatch.turnStartedAt,
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

    const state = readGameState(game.state);
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

    await ctx.db.insert("gameActions", {
      gameId: args.gameId,
      index: nextIndex,
      playerId: playerDoc.enginePlayerId,
      action: { type: "PlaceReinforcementsBatch", placements: args.placements },
      events,
      stateVersionBefore: state.stateVersion,
      stateVersionAfter: nextState.stateVersion,
      createdAt: Date.now(),
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
    });

    await ctx.db.patch(args.gameId, {
      state: nextState,
      stateVersion: nextState.stateVersion,
      turnStartedAt: timingPatch.turnStartedAt,
      turnDeadlineAt: timingPatch.turnDeadlineAt,
      ...(isGameOver
        ? {
            status: "finished" as const,
            finishedAt: now,
            ...winner,
          }
        : {}),
    });

    if (timingPatch.shouldNotify && timingPatch.turnStartedAt) {
      await ctx.scheduler.runAfter(0, internal.asyncTurns.sendYourTurnEmail, {
        gameId: args.gameId,
        expectedPlayerId: nextState.turn.currentPlayerId,
        turnStartedAt: timingPatch.turnStartedAt,
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

    const state = readGameState(game.state);
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

      const { calculateReinforcements } = await import("risk-engine");
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
    });

    await ctx.db.insert("gameActions", {
      gameId,
      index: nextIndex,
      playerId,
      action: { type: "Resign" },
      events,
      stateVersionBefore: state.stateVersion,
      stateVersionAfter: newState.stateVersion,
      createdAt: Date.now(),
    });

    await ctx.db.patch(gameId, {
      state: newState,
      stateVersion: newState.stateVersion,
      turnStartedAt: timingPatch.turnStartedAt,
      turnDeadlineAt: timingPatch.turnDeadlineAt,
      ...(isGameOver
        ? {
            status: "finished" as const,
            finishedAt: now,
            ...winner,
          }
        : {}),
    });

    if (timingPatch.shouldNotify && timingPatch.turnStartedAt) {
      await ctx.scheduler.runAfter(0, internal.asyncTurns.sendYourTurnEmail, {
        gameId,
        expectedPlayerId: newState.turn.currentPlayerId,
        turnStartedAt: timingPatch.turnStartedAt,
      });
    }

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

function toTimelinePublicState(state: GameState): TimelinePublicState {
  const handSizes: Record<string, number> = {};
  for (const [playerId, hand] of Object.entries(state.hands)) {
    handSizes[playerId] = hand.length;
  }

  const turnOrder = [...state.turnOrder];
  const territories = Object.fromEntries(
    Object.entries(state.territories).map(([territoryId, territory]) => [
      territoryId,
      { ownerId: territory.ownerId, armies: territory.armies },
    ]),
  );

  return {
    players: state.players as Record<string, { status: string; teamId?: string }>,
    turnOrder,
    territories,
    turn: {
      currentPlayerId: state.turn.currentPlayerId,
      phase: state.turn.phase,
      round: state.turn.round,
    },
    pending: state.pending
      ? {
          type: "Occupy",
          from: state.pending.from,
          to: state.pending.to,
          minMove: state.pending.minMove,
          maxMove: state.pending.maxMove,
        }
      : undefined,
    reinforcements: state.reinforcements
      ? {
          remaining: state.reinforcements.remaining,
          sources: state.reinforcements.sources,
        }
      : undefined,
    capturedThisTurn: state.capturedThisTurn,
    tradesCompleted: state.tradesCompleted,
    fortifiesUsedThisTurn: state.fortifiesUsedThisTurn,
    deckCount: state.deck.draw.length,
    discardCount: state.deck.discard.length,
    handSizes,
    stateVersion: state.stateVersion,
  };
}

function toPlayerIndex(playerId: string): number {
  const match = /^p(\d+)$/.exec(playerId);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function createInitialStateFromSeed(
  currentState: GameState,
  graphMap: GraphMap,
  playerIds: PlayerId[],
  ruleset: RulesetConfig,
): GameState {
  const territoryIds = Object.keys(graphMap.territories) as TerritoryId[];
  const setup = ruleset.setup;
  const rng = createRng({ seed: currentState.rng.seed, index: 0 });
  const playerTeamIdsByPlayerId: Record<string, string | undefined> = {};
  for (const playerId of playerIds) {
    playerTeamIdsByPlayerId[playerId] = currentState.players[playerId]?.teamId;
  }
  const turnOrder = ruleset.teams.teamsEnabled
    ? createTeamAwareTurnOrder(playerIds, playerTeamIdsByPlayerId, rng)
    : rng.shuffle(playerIds);

  const shuffledTerritories = rng.shuffle(territoryIds);
  const initialArmies = resolveInitialArmies(
    setup,
    playerIds.length,
    territoryIds.length,
    setup.neutralTerritoryCount,
  );

  const neutralCount = Math.min(
    setup.neutralTerritoryCount,
    territoryIds.length - playerIds.length,
  );
  const neutralTerritories = shuffledTerritories.slice(0, neutralCount);
  const playerTerritories = shuffledTerritories.slice(neutralCount);

  const territories: Record<string, { ownerId: PlayerId | "neutral"; armies: number }> = {};

  for (const tid of neutralTerritories) {
    territories[tid] = { ownerId: "neutral", armies: setup.neutralInitialArmies };
  }

  const assignments: Record<string, TerritoryId[]> = {};
  for (const pid of turnOrder) assignments[pid] = [];
  for (let i = 0; i < playerTerritories.length; i++) {
    const pid = turnOrder[i % turnOrder.length]!;
    const tid = playerTerritories[i]!;
    territories[tid] = { ownerId: pid, armies: 1 };
    assignments[pid]!.push(tid);
  }

  for (const pid of turnOrder) {
    const owned = assignments[pid]!;
    distributeInitialArmiesCappedRandom(rng, owned, territories, initialArmies, 4);
  }

  const players: GameState["players"] = {};
  for (const pid of playerIds) {
    players[pid] = {
      status: "alive",
      ...(currentState.players[pid]?.teamId ? { teamId: currentState.players[pid]!.teamId } : {}),
    };
  }

  const deckResult = createDeck(ruleset.cards.deckDefinition, territoryIds, rng);
  const hands: Record<string, readonly CardId[]> = {};
  for (const pid of playerIds) hands[pid] = [];

  const firstPlayer = turnOrder[0]!;
  const reinforcementResult = calculateReinforcements(
    { territories, players } as GameState,
    firstPlayer,
    graphMap,
    ruleset.teams,
    turnOrder,
  );

  return {
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
    rulesetVersion: currentState.rulesetVersion,
  };
}

function applyResignForTimeline(
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

function applyEventsFallbackForTimeline(
  state: GameState,
  rawEvents: unknown[],
  stateVersionAfter?: number,
): GameState {
  const territories: Record<string, { ownerId: PlayerId | "neutral"; armies: number }> = {
    ...state.territories,
  };
  const players: GameState["players"] = { ...state.players };
  const hands: Record<string, readonly CardId[]> = { ...state.hands };
  const turn = { ...state.turn };
  let reinforcements = state.reinforcements ? { ...state.reinforcements } : undefined;
  let pending = state.pending;
  let capturedThisTurn = state.capturedThisTurn;
  let tradesCompleted = state.tradesCompleted;
  let fortifiesUsedThisTurn = state.fortifiesUsedThisTurn;

  const ensureTerritory = (territoryId: string) => {
    if (!territories[territoryId]) {
      territories[territoryId] = { ownerId: "neutral", armies: 0 };
    }
    return territories[territoryId]!;
  };

  for (const rawEvent of rawEvents) {
    if (!rawEvent || typeof rawEvent !== "object") continue;
    const event = rawEvent as Record<string, unknown>;
    switch (event.type) {
      case "ReinforcementsGranted": {
        const amount = typeof event.amount === "number" ? event.amount : 0;
        const sources = event.sources && typeof event.sources === "object"
          ? event.sources as Record<string, number>
          : undefined;
        reinforcements = { remaining: amount, sources };
        turn.phase = "Reinforcement";
        break;
      }
      case "CardsTraded": {
        if (typeof event.tradesCompletedAfter === "number") {
          tradesCompleted = event.tradesCompletedAfter;
        }
        if (reinforcements && typeof event.value === "number") {
          reinforcements = {
            ...reinforcements,
            remaining: reinforcements.remaining + event.value,
          };
        }
        break;
      }
      case "ReinforcementsPlaced": {
        if (typeof event.territoryId !== "string" || typeof event.count !== "number") break;
        const territory = ensureTerritory(event.territoryId);
        territory.armies += event.count;
        if (reinforcements) {
          reinforcements = {
            ...reinforcements,
            remaining: Math.max(0, reinforcements.remaining - event.count),
          };
        }
        break;
      }
      case "AttackResolved": {
        if (typeof event.from !== "string" || typeof event.to !== "string") break;
        const from = ensureTerritory(event.from);
        const to = ensureTerritory(event.to);
        const attackerLosses = typeof event.attackerLosses === "number" ? event.attackerLosses : 0;
        const defenderLosses = typeof event.defenderLosses === "number" ? event.defenderLosses : 0;
        from.armies = Math.max(1, from.armies - attackerLosses);
        to.armies = Math.max(0, to.armies - defenderLosses);
        turn.phase = "Attack";
        break;
      }
      case "TerritoryCaptured": {
        if (typeof event.to !== "string" || typeof event.newOwnerId !== "string") break;
        const to = ensureTerritory(event.to);
        to.ownerId = event.newOwnerId as PlayerId;
        capturedThisTurn = true;
        turn.phase = "Occupy";
        break;
      }
      case "OccupyResolved": {
        if (typeof event.from !== "string" || typeof event.to !== "string") break;
        const moved = typeof event.moved === "number" ? event.moved : 0;
        const from = ensureTerritory(event.from);
        const to = ensureTerritory(event.to);
        from.armies = Math.max(1, from.armies - moved);
        to.armies += moved;
        if (typeof event.playerId === "string") {
          to.ownerId = event.playerId as PlayerId;
        }
        pending = undefined;
        turn.phase = "Attack";
        break;
      }
      case "FortifyResolved": {
        if (typeof event.from !== "string" || typeof event.to !== "string") break;
        const moved = typeof event.moved === "number" ? event.moved : 0;
        const from = ensureTerritory(event.from);
        const to = ensureTerritory(event.to);
        from.armies = Math.max(1, from.armies - moved);
        to.armies += moved;
        turn.phase = "Fortify";
        fortifiesUsedThisTurn = (fortifiesUsedThisTurn ?? 0) + 1;
        break;
      }
      case "PlayerEliminated": {
        if (typeof event.eliminatedId === "string" && players[event.eliminatedId as PlayerId]) {
          players[event.eliminatedId as PlayerId] = {
            ...players[event.eliminatedId as PlayerId]!,
            status: "defeated",
          };
        }
        break;
      }
      case "TurnAdvanced": {
        if (typeof event.nextPlayerId !== "string" || typeof event.round !== "number") break;
        turn.currentPlayerId = event.nextPlayerId as PlayerId;
        turn.round = event.round;
        turn.phase = "Reinforcement";
        pending = undefined;
        capturedThisTurn = false;
        fortifiesUsedThisTurn = 0;
        break;
      }
      case "GameEnded": {
        turn.phase = "GameOver";
        pending = undefined;
        break;
      }
      default:
        break;
    }
  }

  return {
    ...state,
    territories,
    players,
    hands,
    turn,
    reinforcements,
    pending,
    capturedThisTurn,
    tradesCompleted,
    fortifiesUsedThisTurn,
    stateVersion: typeof stateVersionAfter === "number" ? stateVersionAfter : state.stateVersion + 1,
  };
}

export const getHistoryTimeline = query({
  args: {
    gameId: v.id("games"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { gameId, limit }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !game.state) return [];

    const state = readGameState(game.state);
    const mapDoc = await ctx.db
      .query("maps")
      .withIndex("by_mapId", (q) => q.eq("mapId", game.mapId))
      .unique();
    if (!mapDoc) return [];
    const graphMap = readGraphMap(mapDoc.graphMap);
    const ruleset = getGameRuleset({
      teamModeEnabled: game.teamModeEnabled,
      rulesetOverrides: game.rulesetOverrides as RulesetOverrides | undefined,
      effectiveRuleset: game.effectiveRuleset as RulesetConfig | undefined,
    });

    const playerDocs = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();
    const playerIds = playerDocs
      .map((doc) => doc.enginePlayerId)
      .filter((playerId): playerId is string => !!playerId)
      .sort((a, b) => toPlayerIndex(a) - toPlayerIndex(b)) as PlayerId[];
    if (playerIds.length === 0) return [];

    const actions = await ctx.db
      .query("gameActions")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId))
      .order("asc")
      .collect();

    const storedInitialState = game.initialState ? readGameState(game.initialState) : null;
    let simState = storedInitialState ?? createInitialStateFromSeed(state, graphMap, playerIds, ruleset);
    const allowEventFallback = !storedInitialState;
    const timeline: Array<{
      index: number;
      actionType: string;
      label: string;
      actorId: string | null;
      turnRound: number;
      turnPlayerId: string;
      turnPhase: string;
      hasCapture: boolean;
      eliminatedPlayerIds: string[];
      state: TimelinePublicState;
      replayError?: string | null;
    }> = [
      {
        index: -1,
        actionType: "Start",
        label: "Game start",
        actorId: null,
        turnRound: simState.turn.round,
        turnPlayerId: simState.turn.currentPlayerId,
        turnPhase: simState.turn.phase,
        hasCapture: false,
        eliminatedPlayerIds: [],
        state: toTimelinePublicState(simState),
      },
    ];

    for (const actionDoc of actions) {
      const action = actionDoc.action as Record<string, unknown>;
      const actionType = typeof action.type === "string" ? action.type : "Unknown";
      const actorId = actionDoc.playerId as PlayerId;
      let replayError: string | null = null;

      try {
        if (actionType === "Resign") {
          simState = applyResignForTimeline(simState, actorId, graphMap, ruleset);
        } else if (actionType === "PlaceReinforcementsBatch") {
          const placements = Array.isArray(action.placements) ? action.placements : [];
          for (const placement of placements) {
            if (!placement || typeof placement !== "object") continue;
            const territoryId = (placement as { territoryId?: unknown }).territoryId;
            const count = (placement as { count?: unknown }).count;
            if (typeof territoryId !== "string" || typeof count !== "number") continue;
            const result = applyAction(
              simState,
              actorId,
              {
                type: "PlaceReinforcements",
                territoryId: territoryId as TerritoryId,
                count,
              },
              graphMap,
              ruleset.combat,
              ruleset.fortify,
              ruleset.cards,
              ruleset.teams,
            );
            simState = result.state;
          }
        } else {
          const result = applyAction(
            simState,
            actorId,
            action as unknown as Action,
            graphMap,
            ruleset.combat,
            ruleset.fortify,
            ruleset.cards,
            ruleset.teams,
          );
          simState = result.state;
        }
      } catch (error) {
        // Keep playback available even if one legacy action cannot be replayed.
        replayError = error instanceof Error ? error.message : "Unknown replay error";
        if (allowEventFallback) {
          simState = applyEventsFallbackForTimeline(
            simState,
            actionDoc.events as unknown[],
            actionDoc.stateVersionAfter ?? undefined,
          );
        }
      }

      const events = actionDoc.events as GameEvent[];
      const summary = summarizeTimelineFrame({
        action,
        actionType,
        actorId: actionDoc.playerId ?? null,
        events,
        state: simState,
      });
      timeline.push({
        index: actionDoc.index,
        actionType,
        label: summary.label,
        actorId: summary.actorId,
        turnRound: summary.turnRound,
        turnPlayerId: summary.turnPlayerId,
        turnPhase: summary.turnPhase,
        hasCapture: summary.hasCapture,
        eliminatedPlayerIds: summary.eliminatedPlayerIds,
        state: toTimelinePublicState(simState),
        replayError,
      });
    }

    if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
      const keep = Math.floor(limit) + 1;
      if (timeline.length > keep) {
        return timeline.slice(timeline.length - keep);
      }
    }

    return timeline;
  },
});
