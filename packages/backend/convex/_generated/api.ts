/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
  AnyComponents,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";
import type * as games from "../games.js";
import type * as gameplay from "../gameplay.js";
import type * as http from "../http.js";
import type * as lobby from "../lobby.js";
import type * as maps from "../maps.js";
import type * as seed from "../seed.js";

const fullApi: ApiFromModules<{
  games: typeof games;
  gameplay: typeof gameplay;
  http: typeof http;
  lobby: typeof lobby;
  maps: typeof maps;
  seed: typeof seed;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components: AnyComponents = componentsGeneric();
