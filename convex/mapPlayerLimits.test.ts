import { describe, expect, test } from "bun:test";
import {
  defaultMapPlayerLimits,
  resolveMapPlayerLimits,
  validateMapPlayerLimits,
} from "./mapPlayerLimits";

describe("map player limits", () => {
  test("defaults to 2-6 when territory count is unknown", () => {
    expect(defaultMapPlayerLimits()).toEqual({ minPlayers: 2, maxPlayers: 6 });
  });

  test("caps default max players by territory count", () => {
    expect(defaultMapPlayerLimits(4)).toEqual({ minPlayers: 2, maxPlayers: 4 });
  });

  test("resolve returns configured values when present", () => {
    const resolved = resolveMapPlayerLimits({ minPlayers: 3, maxPlayers: 8 }, 42);
    expect(resolved).toEqual({ minPlayers: 3, maxPlayers: 8 });
  });

  test("rejects invalid ranges", () => {
    expect(
      validateMapPlayerLimits({ minPlayers: 1, maxPlayers: 6 }),
    ).toContain("minPlayers must be at least 2");
    expect(
      validateMapPlayerLimits({ minPlayers: 4, maxPlayers: 3 }),
    ).toContain("maxPlayers must be greater than or equal to minPlayers");
  });

  test("rejects maxPlayers above territory count", () => {
    expect(
      validateMapPlayerLimits({ minPlayers: 2, maxPlayers: 7 }, 6),
    ).toContain("maxPlayers cannot exceed territory count (6)");
  });
});
