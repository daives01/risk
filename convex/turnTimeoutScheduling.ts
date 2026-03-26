import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

type SchedulerLike = {
  runAt: (
    timestamp: number,
    functionReference: typeof internal.asyncTurns.processExpiredTurn,
    args: {
      gameId: Id<"games">;
      expectedPlayerId: string;
      expectedTurnStartedAt: number;
    },
  ) => Promise<Id<"_scheduled_functions">>;
  cancel: (id: Id<"_scheduled_functions">) => Promise<void>;
};

export async function scheduleTurnTimeout(args: {
  scheduler: SchedulerLike;
  currentJobId?: Id<"_scheduled_functions">;
  gameId: Id<"games">;
  turnDeadlineAt?: number;
  turnStartedAt?: number;
  expectedPlayerId?: string;
}) {
  if (args.currentJobId) {
    await args.scheduler.cancel(args.currentJobId);
  }
  if (!args.turnDeadlineAt || !args.turnStartedAt || !args.expectedPlayerId) {
    return undefined;
  }
  return await args.scheduler.runAt(
    args.turnDeadlineAt,
    internal.asyncTurns.processExpiredTurn,
    {
      gameId: args.gameId,
      expectedPlayerId: args.expectedPlayerId,
      expectedTurnStartedAt: args.turnStartedAt,
    },
  );
}
