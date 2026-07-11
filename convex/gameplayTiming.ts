import type { GameState } from "risk-engine";
import { computeTurnDeadlineAt, didTurnAdvance, isAsyncTimingMode, type GameTimingMode } from "./gameTiming";

export function resolveTurnTimingPatch(args: {
  timingMode: GameTimingMode;
  excludeWeekends: boolean;
  previousState: GameState;
  nextState: GameState;
  now: number;
  currentTurnStartedAt?: number;
  currentTurnDeadlineAt?: number;
}) {
  if (!isAsyncTimingMode(args.timingMode) || args.nextState.turn.phase === "GameOver") {
    return { turnStartedAt: undefined, turnDeadlineAt: undefined, shouldNotify: false };
  }
  if (!didTurnAdvance(args.previousState, args.nextState)) {
    return { turnStartedAt: args.currentTurnStartedAt, turnDeadlineAt: args.currentTurnDeadlineAt, shouldNotify: false };
  }
  const turnStartedAt = args.now;
  return {
    turnStartedAt,
    turnDeadlineAt: computeTurnDeadlineAt(turnStartedAt, args.timingMode, args.excludeWeekends) ?? undefined,
    shouldNotify: true,
  };
}
