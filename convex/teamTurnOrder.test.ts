import { describe, expect, test } from "bun:test";
import { createRng } from "risk-engine";
import type { PlayerId } from "risk-engine";
import { createTeamAwareTurnOrder } from "./teamTurnOrder";

describe("createTeamAwareTurnOrder", () => {
  test("interleaves players from two evenly sized teams", () => {
    const playerIds = ["p0", "p1", "p2", "p3"] as PlayerId[];
    const playerTeamIds: Record<string, string> = {
      p0: "team-1",
      p1: "team-2",
      p2: "team-1",
      p3: "team-2",
    };
    const rng = createRng({ seed: "team-order", index: 0 });

    const order = createTeamAwareTurnOrder(playerIds, playerTeamIds, rng);
    for (let i = 1; i < order.length; i += 1) {
      expect(playerTeamIds[order[i - 1]!]).not.toBe(playerTeamIds[order[i]!]);
    }
  });

  test("falls back to a plain shuffle when everyone is on one team", () => {
    const playerIds = ["p0", "p1", "p2", "p3"] as PlayerId[];
    const playerTeamIds: Record<string, string> = {
      p0: "team-1",
      p1: "team-1",
      p2: "team-1",
      p3: "team-1",
    };

    const teamAwareRng = createRng({ seed: "single-team", index: 0 });
    const baselineRng = createRng({ seed: "single-team", index: 0 });

    const order = createTeamAwareTurnOrder(playerIds, playerTeamIds, teamAwareRng);
    const baseline = baselineRng.shuffle(playerIds);

    expect(order).toEqual(baseline);
  });
});
