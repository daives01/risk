import { describe, expect, test } from "bun:test";
import type { GameEvent, GameState } from "risk-engine";
import { describeTimelineStep, summarizeTimelineFrame } from "./historyTimeline";

const baseState = {
  turn: {
    round: 3,
    currentPlayerId: "p2",
    phase: "Attack",
  },
} as GameState;

describe("history timeline summaries", () => {
  test("describes known event types", () => {
    expect(describeTimelineStep({ type: "Attack" }, [{ type: "TerritoryCaptured", to: "a" } as GameEvent])).toBe(
      "Territory captured",
    );
    expect(describeTimelineStep({ type: "PlaceReinforcementsBatch" }, [])).toBe("Placement batch confirmed");
  });

  test("extracts capture/elimination markers and labels", () => {
    const summary = summarizeTimelineFrame({
      action: { type: "Attack" },
      actionType: "Attack",
      actorId: "p1",
      events: [
        { type: "TerritoryCaptured", to: "a", newOwnerId: "p1" } as GameEvent,
        { type: "PlayerEliminated", eliminatedId: "p3", byId: "p1", cardsTransferred: [] } as unknown as GameEvent,
      ],
      state: baseState,
    });

    expect(summary.hasCapture).toBe(true);
    expect(summary.eliminatedPlayerIds).toEqual(["p3"]);
    expect(summary.turnRound).toBe(3);
    expect(String(summary.turnPlayerId)).toBe("p2");
    expect(summary.turnPhase).toBe("Attack");
    expect(summary.label).toContain("R3");
    expect(summary.label).toContain("p1");
    expect(summary.label).toContain("Attack");
  });
});
