import type { GameState } from "risk-engine";
import type { Id } from "./_generated/dataModel";
import type { TimelinePublicState } from "./historyTimeline";
import { readGameStateNullable } from "./typeAdapters";

export const GAME_STATE_SNAPSHOT_INTERVAL = 100;

export function publicGameStateProjection(state: GameState): TimelinePublicState {
  const handSizes: Record<string, number> = {};
  for (const [pid, hand] of Object.entries(state.hands)) {
    handSizes[pid] = hand.length;
  }

  return {
    players: state.players as Record<string, { status: string; teamId?: string }>,
    turnOrder: [...state.turnOrder],
    territories: Object.fromEntries(
      Object.entries(state.territories).map(([territoryId, territory]) => [
        territoryId,
        { ownerId: territory.ownerId, armies: territory.armies },
      ]),
    ),
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

export async function getGameStateDoc(ctx: any, gameId: Id<"games">) {
  return await ctx.db
    .query("gameStates")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .unique();
}

export async function readCurrentPrivateGameState(
  ctx: any,
  game: { _id: Id<"games">; state?: unknown },
) {
  const gameState = await getGameStateDoc(ctx, game._id);
  return readGameStateNullable(gameState?.privateState ?? game.state);
}

export async function upsertCurrentGameState(
  ctx: any,
  args: {
    gameId: Id<"games">;
    state: GameState;
    updatedAt: number;
  },
) {
  const existing = await getGameStateDoc(ctx, args.gameId);
  const value = {
    gameId: args.gameId,
    version: args.state.stateVersion,
    privateState: args.state,
    publicState: publicGameStateProjection(args.state),
    updatedAt: args.updatedAt,
  };

  if (existing) {
    await ctx.db.patch(existing._id, value);
    return existing._id;
  }
  return await ctx.db.insert("gameStates", value);
}

export function shouldStoreGameStateSnapshot(index: number) {
  return index === -1 || index % GAME_STATE_SNAPSHOT_INTERVAL === 0;
}

export async function insertGameStateSnapshotIfMissing(
  ctx: any,
  args: {
    gameId: Id<"games">;
    index: number;
    state: GameState;
    createdAt: number;
  },
) {
  if (!shouldStoreGameStateSnapshot(args.index)) return null;
  const existing = await ctx.db
    .query("gameStateSnapshots")
    .withIndex("by_gameId_index", (q: any) => q.eq("gameId", args.gameId).eq("index", args.index))
    .unique();
  if (existing) return existing._id;
  return await ctx.db.insert("gameStateSnapshots", {
    gameId: args.gameId,
    index: args.index,
    publicState: publicGameStateProjection(args.state),
    createdAt: args.createdAt,
  });
}
