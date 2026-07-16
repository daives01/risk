import {
  addRollsToFaceCounts,
  createEmptyDiceRollCounts,
  type AttackResolved,
  type DiceRollCounts,
  type GameState,
} from "risk-engine";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { applyTimelineStatePatch, type TimelinePublicState, type TimelineStatePatch } from "./historyTimeline";

function isAttackResolved(event: unknown): event is AttackResolved {
  return !!event && typeof event === "object" && (event as { type?: unknown }).type === "AttackResolved";
}

function addCombatRolls(
  counts: DiceRollCounts,
  role: "attack" | "defense",
  rolls: readonly number[],
): DiceRollCounts {
  return { ...counts, [role]: addRollsToFaceCounts(counts[role], rolls) };
}

export function accumulateFrameDiceRollCounts(args: {
  countsByPlayerId: Map<string, DiceRollCounts>;
  attackerId: string;
  beforeState: Pick<GameState, "territories"> | Pick<TimelinePublicState, "territories">;
  events: readonly unknown[];
  actionIndex?: number;
}) {
  for (const event of args.events) {
    if (!isAttackResolved(event)) continue;
    const defenderId = args.beforeState.territories[event.to]?.ownerId;
    if (!defenderId) {
      const location = args.actionIndex === undefined ? "" : ` at action ${args.actionIndex}`;
      throw new Error(`Cannot attribute defending rolls${location}: territory ${event.to} has no owner`);
    }
    const attackerCounts = args.countsByPlayerId.get(args.attackerId) ?? createEmptyDiceRollCounts();
    const defenderCounts = args.countsByPlayerId.get(defenderId) ?? createEmptyDiceRollCounts();
    args.countsByPlayerId.set(args.attackerId, addCombatRolls(attackerCounts, "attack", event.attackRolls));
    args.countsByPlayerId.set(defenderId, addCombatRolls(defenderCounts, "defense", event.defendRolls));
  }
}

export async function persistFrameDiceRollCounts(
  ctx: MutationCtx,
  args: {
    gameId: Id<"games">;
    attackerId: string;
    beforeState: GameState;
    events: readonly unknown[];
  },
) {
  if (!args.events.some(isAttackResolved)) return;
  const players = await ctx.db
    .query("gamePlayers")
    .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
    .collect();
  const countsByPlayerId = new Map(
    players
      .filter((player): player is typeof player & { enginePlayerId: string } => !!player.enginePlayerId)
      .map((player) => [player.enginePlayerId, player.diceRollCounts ?? createEmptyDiceRollCounts()]),
  );
  accumulateFrameDiceRollCounts({
    countsByPlayerId,
    attackerId: args.attackerId,
    beforeState: args.beforeState,
    events: args.events,
  });
  for (const player of players) {
    if (!player.enginePlayerId) continue;
    const counts = countsByPlayerId.get(player.enginePlayerId);
    if (counts) await ctx.db.patch(player._id, { diceRollCounts: counts });
  }
}

export const backfillGame = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game) throw new Error("Game not found");
    const initialSnapshot = await ctx.db
      .query("gameStateSnapshots")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId).eq("index", -1))
      .unique();
    if (!initialSnapshot) throw new Error("Cannot backfill dice rolls: initial game-state snapshot is missing");

    const players = await ctx.db
      .query("gamePlayers")
      .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
      .collect();
    const countsByPlayerId = new Map<string, DiceRollCounts>();
    for (const player of players) {
      if (player.enginePlayerId) countsByPlayerId.set(player.enginePlayerId, createEmptyDiceRollCounts());
    }

    const actions = await ctx.db
      .query("gameActions")
      .withIndex("by_gameId_index", (q) => q.eq("gameId", gameId))
      .order("asc")
      .collect();
    let state = initialSnapshot.publicState as TimelinePublicState;
    for (const action of actions) {
      accumulateFrameDiceRollCounts({
        countsByPlayerId,
        attackerId: action.playerId,
        beforeState: state,
        events: Array.isArray(action.events) ? action.events : [],
        actionIndex: action.index,
      });
      if (!action.publicStatePatch) {
        throw new Error(`Cannot backfill dice rolls: action ${action.index} has no public state patch`);
      }
      state = applyTimelineStatePatch(state, action.publicStatePatch as TimelineStatePatch);
    }

    let attackDice = 0;
    let defenseDice = 0;
    for (const player of players) {
      if (!player.enginePlayerId) continue;
      const counts = countsByPlayerId.get(player.enginePlayerId) ?? createEmptyDiceRollCounts();
      attackDice += Object.values(counts.attack).reduce((sum, value) => sum + value, 0);
      defenseDice += Object.values(counts.defense).reduce((sum, value) => sum + value, 0);
      await ctx.db.patch(player._id, { diceRollCounts: counts });
    }

    return {
      actionIndex: actions.length > 0 ? actions[actions.length - 1]!.index : -1,
      playersUpdated: players.filter((player) => !!player.enginePlayerId).length,
      attackDice,
      defenseDice,
    };
  },
});
