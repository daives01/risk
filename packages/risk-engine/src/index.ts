/**
 * risk-engine - A deterministic, headless Risk game engine.
 */

export const ENGINE_VERSION = "0.0.1" as const;

export * from "./types.js";
export { createRng } from "./rng.js";
export type { Rng } from "./rng.js";
export { validateMap } from "./map.js";
export type { GraphMap, TerritoryInfo, ContinentInfo, MapValidationResult } from "./map.js";
