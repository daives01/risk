import type { GameState, GraphMap } from "risk-engine";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readGraphMap(value: unknown): GraphMap {
  if (!isRecord(value) || !isRecord(value.territories) || !isRecord(value.adjacency)) {
    throw new Error("Invalid map data");
  }
  return value as unknown as GraphMap;
}

export function readGameState(value: unknown): GameState {
  if (!isRecord(value) || !isRecord(value.turn) || !isRecord(value.territories)) {
    throw new Error("Invalid game state");
  }
  return value as unknown as GameState;
}

export function readGameStateNullable(value: unknown): GameState | null {
  if (value == null) return null;
  return readGameState(value);
}
