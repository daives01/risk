import { query } from "./_generated/server";
import { ENGINE_VERSION } from "risk-engine";

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("games").collect();
  },
});

export const engineVersion = query({
  handler: async () => {
    return ENGINE_VERSION;
  },
});
