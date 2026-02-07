/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adminMaps from "../adminMaps.js";
import type * as auth from "../auth.js";
import type * as emails from "../emails.js";
import type * as gameChat from "../gameChat.js";
import type * as gameTeams from "../gameTeams.js";
import type * as gameplay from "../gameplay.js";
import type * as games from "../games.js";
import type * as historyTimeline from "../historyTimeline.js";
import type * as http from "../http.js";
import type * as lobby from "../lobby.js";
import type * as mapPlayerLimits from "../mapPlayerLimits.js";
import type * as maps from "../maps.js";
import type * as playerColors from "../playerColors.js";
import type * as rulesets from "../rulesets.js";
import type * as seed from "../seed.js";
import type * as sendEmail from "../sendEmail.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  adminMaps: typeof adminMaps;
  auth: typeof auth;
  emails: typeof emails;
  gameChat: typeof gameChat;
  gameTeams: typeof gameTeams;
  gameplay: typeof gameplay;
  games: typeof games;
  historyTimeline: typeof historyTimeline;
  http: typeof http;
  lobby: typeof lobby;
  mapPlayerLimits: typeof mapPlayerLimits;
  maps: typeof maps;
  playerColors: typeof playerColors;
  rulesets: typeof rulesets;
  seed: typeof seed;
  sendEmail: typeof sendEmail;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
