import type { GameEvent, GameState } from "risk-engine";

export function describeTimelineStep(action: Record<string, unknown>, events: GameEvent[]) {
  const firstEvent = events[0];
  if (firstEvent?.type === "ReinforcementsPlaced") return "Placed armies";
  if (firstEvent?.type === "AttackResolved") return "Attack resolved";
  if (firstEvent?.type === "TerritoryCaptured") return "Territory captured";
  if (firstEvent?.type === "OccupyResolved") return "Occupy move";
  if (firstEvent?.type === "FortifyResolved") return "Fortified";
  if (firstEvent?.type === "TurnAdvanced") return "Turn advanced";
  if (firstEvent?.type === "GameEnded") return "Game ended";

  const actionType = typeof action.type === "string" ? action.type : "Action";
  if (actionType === "PlaceReinforcementsBatch") return "Placement batch confirmed";
  return actionType;
}

export function summarizeTimelineFrame(args: {
  action: Record<string, unknown>;
  actionType: string;
  actorId: string | null;
  events: GameEvent[];
  state: GameState;
}) {
  const { action, actionType, actorId, events, state } = args;
  const eliminatedPlayerIds: string[] = [];
  for (const event of events) {
    if (event.type === "PlayerEliminated" && "eliminatedId" in event && typeof event.eliminatedId === "string") {
      eliminatedPlayerIds.push(event.eliminatedId);
    }
  }
  const hasCapture = events.some((event) => event.type === "TerritoryCaptured");
  const turnRound = state.turn.round;
  const turnPlayerId = state.turn.currentPlayerId;
  const turnPhase = state.turn.phase;
  const actorLabel = actorId ?? "system";

  return {
    actorId,
    hasCapture,
    eliminatedPlayerIds,
    turnRound,
    turnPlayerId,
    turnPhase,
    label: `R${turnRound} ${actorLabel} ${actionType}: ${describeTimelineStep(action, events)}`,
  };
}
