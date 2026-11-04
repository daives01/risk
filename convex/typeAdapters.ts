import type { GameState, GraphMap } from "risk-engine";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

function isList(value: unknown, accepts: (item: unknown) => boolean): boolean {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (!accepts(item)) return false;
  }
  return true;
}

function isDictionary(value: unknown, accepts: (item: unknown) => boolean): boolean {
  return isRecord(value) && Object.values(value).every(accepts);
}

function isOptional(value: unknown, accepts: (item: unknown) => boolean): boolean {
  return value === undefined || accepts(value);
}

function isTerritoryInfo(value: unknown): boolean {
  return isRecord(value)
    && isOptional(value.name, isString)
    && isOptional(value.continentId, isString)
    && isOptional(value.tags, (tags) => isList(tags, isString));
}

function isContinentInfo(value: unknown): boolean {
  return isRecord(value)
    && isList(value.territoryIds, isString)
    && isNumber(value.bonus);
}

// Engine ID brands are compile-time distinctions; their serialized representation is a string.
// These guards validate structure, leaving graph/game consistency to engine validation.
function isGraphMap(value: unknown): value is GraphMap {
  return isRecord(value)
    && isDictionary(value.territories, isTerritoryInfo)
    && isDictionary(value.adjacency, (neighbors) => isList(neighbors, isString))
    && isOptional(value.continents, (continents) => isDictionary(continents, isContinentInfo));
}

function isPlayerState(value: unknown): boolean {
  return isRecord(value)
    && (value.status === "alive" || value.status === "defeated")
    && isOptional(value.teamId, isString);
}

function isTerritoryState(value: unknown): boolean {
  return isRecord(value) && isString(value.ownerId) && isNumber(value.armies);
}

function isTurnState(value: unknown): boolean {
  return isRecord(value)
    && isString(value.currentPlayerId)
    && (value.phase === "Setup"
      || value.phase === "Reinforcement"
      || value.phase === "Attack"
      || value.phase === "Occupy"
      || value.phase === "Fortify"
      || value.phase === "GameOver")
    && isNumber(value.round);
}

function isPendingOccupy(value: unknown): boolean {
  return isRecord(value)
    && value.type === "Occupy"
    && isString(value.from)
    && isString(value.to)
    && isNumber(value.minMove)
    && isNumber(value.maxMove);
}

function isReinforcements(value: unknown): boolean {
  return isRecord(value)
    && isNumber(value.remaining)
    && isOptional(value.sources, (sources) => isDictionary(sources, isNumber));
}

function isDeckState(value: unknown): boolean {
  return isRecord(value)
    && isList(value.draw, isString)
    && isList(value.discard, isString);
}

function isCardState(value: unknown): boolean {
  return isRecord(value)
    && (value.kind === "A" || value.kind === "B" || value.kind === "C" || value.kind === "W")
    && isOptional(value.territoryId, isString);
}

function isRngState(value: unknown): boolean {
  return isRecord(value)
    && (isString(value.seed) || isNumber(value.seed))
    && isNumber(value.index);
}

function isGameState(value: unknown): value is GameState {
  return isRecord(value)
    && isDictionary(value.players, isPlayerState)
    && isList(value.turnOrder, isString)
    && isDictionary(value.territories, isTerritoryState)
    && isTurnState(value.turn)
    && isOptional(value.pending, isPendingOccupy)
    && isOptional(value.reinforcements, isReinforcements)
    && isDeckState(value.deck)
    && isDictionary(value.cardsById, isCardState)
    && isDictionary(value.hands, (cards) => isList(cards, isString))
    && isNumber(value.tradesCompleted)
    && typeof value.capturedThisTurn === "boolean"
    && isOptional(value.fortifiesUsedThisTurn, isNumber)
    && isRngState(value.rng)
    && isNumber(value.stateVersion)
    && isNumber(value.rulesetVersion);
}

export function readGraphMap(value: unknown): GraphMap {
  if (!isGraphMap(value)) throw new Error("Invalid map data");
  return value;
}

export function readGameState(value: unknown): GameState {
  if (!isGameState(value)) throw new Error("Invalid game state");
  return value;
}

export function readGameStateNullable(value: unknown): GameState | null {
  if (value == null) return null;
  return readGameState(value);
}
