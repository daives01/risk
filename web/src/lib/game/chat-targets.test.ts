/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  buildChatTargetOptions,
  findChatTargetOptionMatches,
  getChatTargetSelectValue,
} from "./chat-targets";

describe("chat targets", () => {
  test("builds all, team, and direct-message slash targets", () => {
    const options = buildChatTargetOptions({
      players: [
        { displayName: "Me", enginePlayerId: "p1" },
        { displayName: "Ada Lovelace", enginePlayerId: "p2" },
        { displayName: "Spectator", enginePlayerId: null },
      ],
      myEnginePlayerId: "p1",
      teamGameEnabled: true,
      teamAvailable: true,
    });

    expect(options.map((option) => option.key)).toEqual(["all", "team", "dm:p2"]);
    expect(options.find((option) => option.key === "dm:p2")?.command).toBe("adalovelace");
  });

  test("matches slash targets by command and alias", () => {
    const options = buildChatTargetOptions({
      players: [{ displayName: "Ada Lovelace", enginePlayerId: "p2" }],
      myEnginePlayerId: "p1",
      teamGameEnabled: false,
      teamAvailable: false,
    });

    expect(findChatTargetOptionMatches(options, "g").map((option) => option.key)).toEqual(["all"]);
    expect(findChatTargetOptionMatches(options, "ada").map((option) => option.key)).toEqual(["dm:p2"]);
    expect(findChatTargetOptionMatches(options, null)).toEqual([]);
  });

  test("formats select values for channels with optional recipients", () => {
    expect(getChatTargetSelectValue("all", null)).toBe("all");
    expect(getChatTargetSelectValue("team", null)).toBe("team");
    expect(getChatTargetSelectValue("dm", "p2")).toBe("dm:p2");
  });
});
