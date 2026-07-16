import { describe, expect, test } from "bun:test";
import {
  fromTeamLuckSubjectId,
  resolveLuckComparisonPresentation,
  toTeamLuckSubjectId,
} from "./luck-comparison-transition";

describe("luck comparison transition", () => {
  test("encodes and decodes team subject IDs centrally", () => {
    const subjectId = toTeamLuckSubjectId("red");
    expect(subjectId).toBe("team:red");
    expect(fromTeamLuckSubjectId(subjectId)).toBe("red");
  });

  test("presents the destination mode and selection while its dots finish moving", () => {
    expect(resolveLuckComparisonPresentation({
      comparisonMode: "individual",
      transitionTarget: "teams",
      selectedId: "player-1",
      players: [
        { id: "player-1", teamId: "red" },
        { id: "player-2", teamId: "red" },
      ],
    })).toEqual({
      mode: "teams",
      selectedId: "team:red",
    });

    expect(resolveLuckComparisonPresentation({
      comparisonMode: "teams",
      transitionTarget: "individual",
      selectedId: "team:red",
      players: [
        { id: "player-1", teamId: "red" },
        { id: "player-2", teamId: "red" },
      ],
    })).toEqual({
      mode: "individual",
      selectedId: "player-1",
    });
  });
});
