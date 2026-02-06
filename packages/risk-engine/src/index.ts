/**
 * risk-engine - A deterministic, headless Risk game engine.
 */

export const ENGINE_VERSION = "0.0.1" as const;

export * from "./types.js";
export { createRng } from "./rng.js";
export type { Rng } from "./rng.js";
export { validateMap } from "./map.js";
export type { GraphMap, TerritoryInfo, ContinentInfo, MapValidationResult } from "./map.js";
export { defaultRuleset } from "./config.js";
export type { RulesetConfig, SetupConfig, CombatConfig, FortifyConfig, CardsConfig, TeamsConfig } from "./config.js";
export { calculateReinforcements } from "./reinforcements.js";
export type { ReinforcementResult } from "./reinforcements.js";
export { applyAction, ActionError } from "./engine.js";
export type { ActionResult } from "./engine.js";
export { createDeck, drawCard } from "./cards.js";
export type { DeckCreationResult, DrawResult } from "./cards.js";
export { canPlace, canAttack, canFortifyFrom, canFortifyTo, canTraverse } from "./permissions.js";
export { getLegalActions } from "./legal-actions.js";
export type { LegalActionsConfig } from "./legal-actions.js";
