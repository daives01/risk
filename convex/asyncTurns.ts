import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { applyAction, type Action, type GameState, type GraphMap, type PlayerId, type RulesetConfig, type TerritoryId } from "risk-engine";
import { internal, components } from "./_generated/api";
import { resolveEffectiveRuleset, type RulesetOverrides } from "./rulesets";
import { computeTurnDeadlineAt, didTurnAdvance, isAsyncTimingMode, type GameTimingMode } from "./gameTiming";
import { yourTurnEmailHtml } from "./emails";
import { readGameStateNullable, readGraphMap } from "./typeAdapters";

function getGameRuleset(game: {
  teamModeEnabled?: boolean;
  rulesetOverrides?: RulesetOverrides;
  effectiveRuleset?: RulesetConfig;
}): RulesetConfig {
  return resolveEffectiveRuleset(game);
}

function extractGameWinner(events: unknown[]): {
  winningPlayerId?: string;
  winningTeamId?: string;
} {
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const typedEvent = event as { type?: unknown; winningPlayerId?: unknown; winningTeamId?: unknown };
    if (typedEvent.type !== "GameEnded") continue;
    const winningPlayerId =
      typeof typedEvent.winningPlayerId === "string" ? typedEvent.winningPlayerId : undefined;
    const winningTeamId =
      typeof typedEvent.winningTeamId === "string" ? typedEvent.winningTeamId : undefined;
    return { ...(winningPlayerId ? { winningPlayerId } : {}), ...(winningTeamId ? { winningTeamId } : {}) };
  }
  return {};
}

function resolveTurnRolloverPatch(args: {
  timingMode: GameTimingMode;
  excludeWeekends: boolean;
  previousState: GameState;
  nextState: GameState;
  now: number;
}) {
  if (!isAsyncTimingMode(args.timingMode) || args.nextState.turn.phase === "GameOver") {
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

function applyTimeoutTurnResolution(args: {
  state: GameState;
  playerId: PlayerId;
  graphMap: GraphMap;
  ruleset: RulesetConfig;
}) {
  let workingState = args.state;
  const actionLogs: Array<{
    action: Action;
    events: unknown[];
    beforeVersion: number;
    afterVersion: number;
  }> = [];

  const apply = (action: Action) => {
    const result = applyAction(
      workingState,
      args.playerId,
      action,
      args.graphMap,
      args.ruleset.combat,
      args.ruleset.fortify,
      args.ruleset.cards,
      args.ruleset.teams,
    );
    actionLogs.push({
      action,
      events: [...result.events],
      beforeVersion: workingState.stateVersion,
      afterVersion: result.state.stateVersion,
    });
    workingState = result.state;
  };

  switch (workingState.turn.phase) {
    case "Reinforcement": {
      const remaining = workingState.reinforcements?.remaining ?? 0;
      if (remaining > 0) {
        const ownedTerritoryId = Object.keys(workingState.territories)
          .sort()
          .find((territoryId) => workingState.territories[territoryId]?.ownerId === args.playerId);
        if (!ownedTerritoryId) {
          return null;
        }
        apply({
          type: "PlaceReinforcements",
          territoryId: ownedTerritoryId as TerritoryId,
          count: remaining,
        });
      }
      if (workingState.turn.currentPlayerId === args.playerId) {
        apply({ type: "EndTurn" });
      }
      break;
    }
    case "Attack":
    case "Fortify": {
      apply({ type: "EndTurn" });
      break;
    }
    case "Occupy": {
      if (!workingState.pending || workingState.pending.type !== "Occupy") {
        return null;
      }
      apply({
        type: "Occupy",
        moveArmies: workingState.pending.minMove,
      });
      if (workingState.turn.currentPlayerId === args.playerId) {
        apply({ type: "EndTurn" });
      }
      break;
    }
    case "GameOver":
    case "Setup":
      return null;
  }

  if (actionLogs.length === 0) return null;
  return { nextState: workingState, actionLogs };
}

export const processExpiredTurns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const [async1dGames, async3dGames] = await Promise.all([
      ctx.db
        .query("games")
        .withIndex("by_status_timingMode_turnDeadlineAt", (q) =>
          q
            .eq("status", "active")
            .eq("timingMode", "async_1d")
            .lte("turnDeadlineAt", now),
        )
        .collect(),
      ctx.db
        .query("games")
        .withIndex("by_status_timingMode_turnDeadlineAt", (q) =>
          q
            .eq("status", "active")
            .eq("timingMode", "async_3d")
            .lte("turnDeadlineAt", now),
        )
        .collect(),
    ]);
    const games = [...async1dGames, ...async3dGames];

    let processed = 0;

    for (const game of games) {
      if (
        game.status !== "active" ||
        !isAsyncTimingMode((game.timingMode ?? "realtime") as GameTimingMode) ||
        !game.turnDeadlineAt ||
        game.turnDeadlineAt > now
      ) {
        continue;
      }

      const state = readGameStateNullable(game.state);
      if (!state || state.turn.phase === "GameOver") continue;

      const timedOutPlayerId = state.turn.currentPlayerId as PlayerId;
      const mapDoc = await ctx.db
        .query("maps")
        .withIndex("by_mapId", (q) => q.eq("mapId", game.mapId))
        .unique();
      if (!mapDoc) continue;

      const ruleset = getGameRuleset({
        teamModeEnabled: game.teamModeEnabled,
        rulesetOverrides: game.rulesetOverrides as RulesetOverrides | undefined,
        effectiveRuleset: game.effectiveRuleset as RulesetConfig | undefined,
      });
      const resolution = applyTimeoutTurnResolution({
        state,
        playerId: timedOutPlayerId,
        graphMap: readGraphMap(mapDoc.graphMap),
        ruleset,
      });
      if (!resolution) continue;

      const actionHead = await ctx.db
        .query("gameActions")
        .withIndex("by_gameId_index", (q) => q.eq("gameId", game._id))
        .order("desc")
        .first();
      let actionIndex = actionHead ? actionHead.index + 1 : 0;

      for (let idx = 0; idx < resolution.actionLogs.length; idx++) {
        const actionLog = resolution.actionLogs[idx]!;
        const events = idx === 0
          ? [{ type: "TurnTimedOut", playerId: timedOutPlayerId }, ...actionLog.events]
          : actionLog.events;
        await ctx.db.insert("gameActions", {
          gameId: game._id,
          index: actionIndex,
          playerId: timedOutPlayerId,
          action: actionLog.action,
          events,
          stateVersionBefore: actionLog.beforeVersion,
          stateVersionAfter: actionLog.afterVersion,
          createdAt: now,
        });
        actionIndex += 1;
      }

      const isGameOver = resolution.nextState.turn.phase === "GameOver";
      const winner = isGameOver
        ? extractGameWinner(
            resolution.actionLogs.flatMap((actionLog) => actionLog.events),
          )
        : {};
      const rollover = resolveTurnRolloverPatch({
        timingMode: (game.timingMode ?? "realtime") as GameTimingMode,
        excludeWeekends: game.excludeWeekends ?? false,
        previousState: state,
        nextState: resolution.nextState,
        now,
      });

      await ctx.db.patch(game._id, {
        state: resolution.nextState,
        stateVersion: resolution.nextState.stateVersion,
        ...(isGameOver
          ? { status: "finished" as const, finishedAt: now, ...winner }
          : {}),
        turnStartedAt: rollover.turnStartedAt,
        turnDeadlineAt: rollover.turnDeadlineAt,
      });

      if (rollover.shouldNotify && rollover.turnStartedAt) {
        await ctx.scheduler.runAfter(0, internal.asyncTurns.sendYourTurnEmail, {
          gameId: game._id,
          expectedPlayerId: resolution.nextState.turn.currentPlayerId,
          turnStartedAt: rollover.turnStartedAt,
        });
      }

      processed += 1;
    }

    return { processed };
  },
});

export const sendYourTurnEmail = internalAction({
  args: {
    gameId: v.id("games"),
    expectedPlayerId: v.string(),
    turnStartedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.runQuery(internal.asyncTurns.getGameForNotification, {
      gameId: args.gameId,
    });
    if (!game) return { sent: false, reason: "game_not_found" };
    if (game.status !== "active") return { sent: false, reason: "not_active" };
    if (!isAsyncTimingMode((game.timingMode ?? "realtime") as GameTimingMode)) {
      return { sent: false, reason: "not_async" };
    }
    if (game.turnStartedAt !== args.turnStartedAt) {
      return { sent: false, reason: "stale_turn" };
    }

    const state = readGameStateNullable(game.state);
    if (!state || state.turn.currentPlayerId !== args.expectedPlayerId) {
      return { sent: false, reason: "player_mismatch" };
    }

    const targetPlayer = game.players.find((player) => player.enginePlayerId === args.expectedPlayerId);
    if (!targetPlayer) return { sent: false, reason: "target_missing" };

    const settings = await ctx.runQuery(internal.asyncTurns.getUserTurnEmailSetting, {
      userId: targetPlayer.userId,
    });
    if (!settings.emailTurnNotificationsEnabled) {
      return { sent: false, reason: "disabled_by_user" };
    }

    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "userId", operator: "eq", value: targetPlayer.userId }],
    }) ?? await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "_id", operator: "eq", value: targetPlayer.userId }],
    });

    const email = (user as { email?: string | null } | null)?.email?.trim();
    if (!email) return { sent: false, reason: "email_missing" };

    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
    const siteUrl = env.SITE_URL ?? "http://localhost:5173";
    const gameUrl = `${siteUrl}/play/${game._id}`;
    const turnDeadlineLabel = game.turnDeadlineAt
      ? new Date(game.turnDeadlineAt).toUTCString()
      : null;

    await ctx.runAction(internal.sendEmail.sendEmail, {
      to: email,
      subject: `Your turn: ${game.name}`,
      html: yourTurnEmailHtml({
        gameName: game.name,
        gameUrl,
        turnDeadlineLabel,
      }),
    });

    return { sent: true };
  },
});

export const getGameForNotification = internalQuery({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return null;
    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();

    return {
      ...game,
      players,
    };
  },
});

export const getUserTurnEmailSetting = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    return {
      emailTurnNotificationsEnabled:
        settings?.emailTurnNotificationsEnabled ?? true,
    };
  },
});
