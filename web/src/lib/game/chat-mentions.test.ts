/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  buildChatMentionResolver,
  findActiveChatMentionQuery,
  formatBracketMentionToken,
  getMentionDisplayLabel,
  tokenizeChatText,
} from "./chat-mentions";

const resolver = buildChatMentionResolver(
  [
    { displayName: "Ada Lovelace", enginePlayerId: "p1", teamId: "red" },
    { displayName: "Grace Hopper", enginePlayerId: "p2", teamId: "blue" },
  ],
  { red: "Red Team", blue: "Blue Team" },
  {
    territories: {
      alaska: { name: "Alaska" },
      northwest_territory: { name: "Northwest Territory" },
    },
  },
);

describe("chat mentions", () => {
  test("resolves players, teams, and territories", () => {
    expect(resolver.resolve("Ada Lovelace")).toEqual({ kind: "player", playerId: "p1" });
    expect(resolver.resolve("red team")).toEqual({ kind: "team", teamId: "red" });
    expect(resolver.resolve("northwest territory")).toEqual({
      kind: "territory",
      territoryId: "northwest_territory",
    });
  });

  test("keeps ambiguous bare mentions unresolved", () => {
    const ambiguousResolver = buildChatMentionResolver(
      [
        { displayName: "Alex", enginePlayerId: "p1" },
        { displayName: "Alex", enginePlayerId: "p2" },
      ],
      {},
      { territories: {} },
    );

    expect(ambiguousResolver.resolve("Alex")).toBeNull();
    expect(ambiguousResolver.options).toHaveLength(2);
  });

  test("formats and displays bracket mention tokens", () => {
    expect(formatBracketMentionToken("Northwest Territory]")).toBe("@[Northwest Territory]");
    expect(getMentionDisplayLabel("@[Northwest Territory]")).toBe("@Northwest Territory");
    expect(getMentionDisplayLabel("@alaska")).toBe("@alaska");
  });

  test("tokenizes resolved bare and bracket mentions without losing surrounding text", () => {
    expect(tokenizeChatText("Hold @Alaska with @[Ada Lovelace].", resolver)).toEqual([
      "Hold ",
      { token: "@Alaska", resolved: { kind: "territory", territoryId: "alaska" } },
      " with ",
      { token: "@[Ada Lovelace]", resolved: { kind: "player", playerId: "p1" } },
      ".",
    ]);
  });

  test("finds active mention query at the composer cursor", () => {
    expect(findActiveChatMentionQuery("attack @Nor", 11, null)).toEqual({
      query: "Nor",
      normalizedQuery: "nor",
      tokenStart: 7,
      cursor: 11,
    });
    expect(findActiveChatMentionQuery("attack @Nor now", 15, null)).toBeNull();
    expect(findActiveChatMentionQuery("attack @Nor", 11, "editing-id")).toBeNull();
  });
});
