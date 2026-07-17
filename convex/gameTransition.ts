import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  ActionError,
  applyAction,
  createRng,
  type Action,
  type GameState,
  type PlayerId,
  type RulesetConfig,
  type TerritoryId,
} from "risk-engine";
import { resolveEffectiveRuleset, type RulesetOverrides } from "./rulesets";
import { readGraphMap } from "./typeAdapters";
import {
  insertGameStateSnapshotIfMissing,
  publicGameStateProjection,
  readCurrentPrivateGameState,
  upsertCurrentGameState,
} from "./gameState";
import { buildTimelineStatePatch } from "./historyTimeline";
import { resolveTurnTimingPatch } from "./gameplayTiming";
import { isAsyncTimingMode, type GameTimingMode } from "./gameTiming";
import { scheduleTurnTimeout } from "./turnTimeoutScheduling";
import { persistFrameGameLuck } from "./gameLuck";

export type GameTransitionSource =
  | { type: "user"; playerId: PlayerId; actingUserId: string; wasDelegated: boolean }
  | { type: "system_timeout"; playerId: PlayerId };

export type GameTransitionIntent =
  | { type: "action"; action: Action; expectedVersion: number }
  | { type: "reinforcement_batch"; placements: readonly { territoryId: string; count: number }[]; expectedVersion: number }
  | { type: "resign" }
  | { type: "timeout"; expectedPlayerId: PlayerId; expectedTurnStartedAt: number };

export type GameTransitionRejectionReason =
  | "game_not_found"
  | "inactive_game"
  | "state_missing"
  | "map_missing"
  | "stale_version"
  | "expired_turn"
  | "invalid_action"
  | "stale_timeout"
  | "timeout_player_changed"
  | "game_over"
  | "no_timeout_resolution";

export class GameTransitionRejected extends Error {
  readonly reason: GameTransitionRejectionReason;

  constructor(reason: GameTransitionRejectionReason, message: string) {
    super(message);
    this.reason = reason;
    this.name = "GameTransitionRejected";
  }
}

type GameTransitionHistoryFrame = {
  action: Action | { type: "PlaceReinforcementsBatch"; placements: readonly { territoryId: string; count: number }[] };
  events: readonly unknown[];
  beforeState: GameState;
  afterState: GameState;
};

export function applyTimeoutPolicy(args: {
  state: GameState;
  playerId: PlayerId;
  graphMap: Parameters<typeof applyAction>[3];
  ruleset: RulesetConfig;
}): GameTransitionHistoryFrame[] | null {
  let workingState = args.state;
  const historyFrames: GameTransitionHistoryFrame[] = [];
  const apply = (action: Action) => {
    const beforeState = workingState;
    const result = applyAction(
      beforeState,
      args.playerId,
      action,
      args.graphMap,
      args.ruleset.combat,
      args.ruleset.fortify,
      args.ruleset.cards,
      args.ruleset.teams,
      action.type === "PlaceReinforcements" || action.type === "EndAttackPhase"
        ? {
          ...(action.type === "PlaceReinforcements" ? { allowPlacementWithoutForcedTrade: true } : {}),
          ...(action.type === "EndAttackPhase" ? { allowTurnAdvanceWithoutForcedTrade: true } : {}),
        }
        : undefined,
    );
    historyFrames.push({ action, events: result.events, beforeState, afterState: result.state });
    workingState = result.state;
  };

  const endTurn = () => {
    if (workingState.turn.currentPlayerId !== args.playerId) return;
    if (workingState.turn.phase === "Attack") apply({ type: "EndAttackPhase" });
    if (workingState.turn.phase === "Fortify") apply({ type: "EndTurn" });
  };

  if (workingState.turn.phase === "Reinforcement") {
    const remaining = workingState.reinforcements?.remaining ?? 0;
    const owned = Object.keys(workingState.territories)
      .sort()
      .filter((id) => workingState.territories[id]?.ownerId === args.playerId);
    if (remaining > 0 && owned.length === 0) return null;
    const rng = createRng(workingState.rng);
    const allocations = new Map<TerritoryId, number>();
    for (let count = 0; count < remaining; count += 1) {
      const id = owned[rng.nextInt(0, owned.length - 1)] as TerritoryId;
      allocations.set(id, (allocations.get(id) ?? 0) + 1);
    }
    workingState = { ...workingState, rng: rng.state };
    for (const [territoryId, count] of allocations) {
      apply({ type: "PlaceReinforcements", territoryId, count });
    }
    endTurn();
  } else if (workingState.turn.phase === "Attack" || workingState.turn.phase === "Fortify") {
    endTurn();
  } else if (workingState.turn.phase === "Occupy") {
    if (!workingState.pending) return null;
    apply({ type: "Occupy", moveArmies: workingState.pending.minMove });
    endTurn();
  } else {
    return null;
  }
  return historyFrames.length > 0 ? historyFrames : null;
}

function winnerFrom(events: readonly unknown[]) {
  const event = events.find((value) => value && typeof value === "object" && (value as { type?: string }).type === "GameEnded") as
    | { winningPlayerId?: unknown; winningTeamId?: unknown }
    | undefined;
  return {
    ...(typeof event?.winningPlayerId === "string" ? { winningPlayerId: event.winningPlayerId } : {}),
    ...(typeof event?.winningTeamId === "string" ? { winningTeamId: event.winningTeamId } : {}),
  };
}

export async function executeGameTransition(
  ctx: MutationCtx,
  args: { gameId: Id<"games">; source: GameTransitionSource; intent: GameTransitionIntent; now?: number },
) {
  const now = args.now ?? Date.now();
  const game = await ctx.db.get(args.gameId);
  if (!game) throw new GameTransitionRejected("game_not_found", "Game not found");
  if (game.status !== "active") throw new GameTransitionRejected("inactive_game", "Game is not active");
  const state = await readCurrentPrivateGameState(ctx, game);
  if (!state) throw new GameTransitionRejected("state_missing", "Game has no state");

  if (args.intent.type === "timeout") {
    if (state.turn.phase === "GameOver") throw new GameTransitionRejected("game_over", "Game is over");
    if (args.source.type !== "system_timeout" ||
      !isAsyncTimingMode((game.timingMode ?? "realtime") as GameTimingMode) ||
      !game.turnDeadlineAt || game.turnDeadlineAt > now ||
      game.turnStartedAt !== args.intent.expectedTurnStartedAt) {
      throw new GameTransitionRejected("stale_timeout", "Timeout is stale");
    }
    if (state.turn.currentPlayerId !== args.intent.expectedPlayerId) {
      throw new GameTransitionRejected("timeout_player_changed", "Timed-out player changed");
    }
  } else {
    if (args.intent.type !== "resign" && isAsyncTimingMode((game.timingMode ?? "realtime") as GameTimingMode) && game.turnDeadlineAt && now > game.turnDeadlineAt) {
      throw new GameTransitionRejected("expired_turn", "This turn has timed out and will be advanced automatically.");
    }
    if ("expectedVersion" in args.intent && state.stateVersion !== args.intent.expectedVersion) {
      throw new GameTransitionRejected("stale_version", `Version mismatch: expected ${args.intent.expectedVersion}, current ${state.stateVersion}`);
    }
  }

  const mapDoc = await ctx.db.query("maps").withIndex("by_mapId", (q) => q.eq("mapId", game.mapId)).unique();
  if (!mapDoc) throw new GameTransitionRejected("map_missing", "Map not found");
  const graphMap = readGraphMap(mapDoc.graphMap);
  const ruleset = resolveEffectiveRuleset({
    teamModeEnabled: game.teamModeEnabled,
    rulesetOverrides: game.rulesetOverrides as RulesetOverrides | undefined,
    effectiveRuleset: game.effectiveRuleset as RulesetConfig | undefined,
  });
  let historyFrames: GameTransitionHistoryFrame[] | null = null;
  try {
    if (args.intent.type === "timeout") {
      historyFrames = applyTimeoutPolicy({ state, playerId: args.source.playerId, graphMap, ruleset });
    } else if (args.intent.type === "reinforcement_batch") {
      if (args.intent.placements.length === 0) throw new ActionError("No placements to submit");
      let working = state;
      const events: unknown[] = [];
      for (const placement of args.intent.placements) {
        const count = Math.trunc(placement.count);
        if (!Number.isFinite(count) || count < 1) throw new ActionError("Each placement count must be a positive integer");
        const result = applyAction(working, args.source.playerId, {
          type: "PlaceReinforcements", territoryId: placement.territoryId as TerritoryId, count,
        }, graphMap, ruleset.combat, ruleset.fortify, ruleset.cards, ruleset.teams);
        working = result.state;
        events.push(...result.events);
      }
      historyFrames = [{ action: { type: "PlaceReinforcementsBatch", placements: args.intent.placements }, events, beforeState: state, afterState: working }];
    } else {
      const action: Action = args.intent.type === "resign" ? { type: "Resign" } : args.intent.action;
      const result = applyAction(state, args.source.playerId, action, graphMap, ruleset.combat, ruleset.fortify, ruleset.cards, ruleset.teams);
      historyFrames = [{ action, events: result.events, beforeState: state, afterState: result.state }];
    }
  } catch (error) {
    if (error instanceof ActionError) throw new GameTransitionRejected("invalid_action", error.message);
    throw error;
  }
  if (!historyFrames) throw new GameTransitionRejected("no_timeout_resolution", "No timeout resolution available");

  const head = await ctx.db.query("gameActions").withIndex("by_gameId_index", (q) => q.eq("gameId", args.gameId)).order("desc").first();
  let index = head ? head.index + 1 : 0;
  for (let offset = 0; offset < historyFrames.length; offset += 1) {
    const frame = historyFrames[offset]!;
    const events = args.intent.type === "timeout" && offset === 0
      ? [{ type: "TurnTimedOut", playerId: args.source.playerId }, ...frame.events]
      : frame.events;
    await ctx.db.insert("gameActions", {
      gameId: args.gameId, index, playerId: args.source.playerId, action: frame.action, events,
      publicStatePatch: buildTimelineStatePatch(publicGameStateProjection(frame.beforeState), publicGameStateProjection(frame.afterState)),
      ...(args.source.type === "user" ? { actingUserId: args.source.actingUserId, wasDelegated: args.source.wasDelegated } : {}),
      stateVersionBefore: frame.beforeState.stateVersion, stateVersionAfter: frame.afterState.stateVersion, createdAt: now,
    });
    await persistFrameGameLuck(ctx, {
      gameId: args.gameId,
      attackerId: args.source.playerId,
      beforeState: frame.beforeState,
      events,
    });
    await insertGameStateSnapshotIfMissing(ctx, { gameId: args.gameId, index, state: frame.afterState, createdAt: now });
    index += 1;
  }
  const nextState = historyFrames[historyFrames.length - 1]!.afterState;
  const allEvents = historyFrames.flatMap((frame) => [...frame.events]);
  const timing = resolveTurnTimingPatch({
    timingMode: (game.timingMode ?? "realtime") as GameTimingMode, excludeWeekends: game.excludeWeekends ?? false,
    previousState: state, nextState, now, currentTurnStartedAt: game.turnStartedAt ?? undefined,
    currentTurnDeadlineAt: game.turnDeadlineAt ?? undefined,
  });
  const turnTimeoutJobId = await scheduleTurnTimeout({
    scheduler: ctx.scheduler,
    ...(args.source.type === "user" ? { currentJobId: game.turnTimeoutJobId } : {}),
    gameId: args.gameId, turnDeadlineAt: timing.turnDeadlineAt, turnStartedAt: timing.turnStartedAt,
    expectedPlayerId: timing.turnStartedAt ? nextState.turn.currentPlayerId : undefined,
  });
  await upsertCurrentGameState(ctx, { gameId: args.gameId, state: nextState, updatedAt: now });
  const isGameOver = nextState.turn.phase === "GameOver";
  await ctx.db.patch(args.gameId, {
    turnStartedAt: timing.turnStartedAt, turnDeadlineAt: timing.turnDeadlineAt, turnTimeoutJobId,
    ...(isGameOver ? { status: "finished" as const, finishedAt: now, ...winnerFrom(allEvents) } : {}),
  });
  if (timing.shouldNotify && timing.turnStartedAt) {
    await ctx.scheduler.runAfter(0, (internal as any).turnNotifications.sendTurnNotifications, {
      gameId: args.gameId, expectedPlayerId: nextState.turn.currentPlayerId, turnStartedAt: timing.turnStartedAt,
    });
  }
  const eliminated = allEvents.filter((event): event is { eliminatedId: string; byId?: string } =>
    !!event && typeof event === "object" && (event as { type?: string }).type === "PlayerEliminated" && typeof (event as { eliminatedId?: unknown }).eliminatedId === "string");
  if (eliminated.length > 0) {
    await ctx.scheduler.runAfter(0, (internal as any).eliminationNotifications.sendEliminationNotifications, {
      gameId: args.gameId, eliminatedPlayerIds: eliminated.map((event) => event.eliminatedId),
      ...(typeof eliminated[0]?.byId === "string" ? { byPlayerId: eliminated[0].byId } : {}),
    });
  }
  return { events: allEvents, newVersion: nextState.stateVersion, frameCount: historyFrames.length };
}
