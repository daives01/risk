/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import {
  findActiveChatEmojiQuery,
  findChatEmojiMatches,
} from "./chat-emoji";

describe("chat emoji", () => {
  test("finds active emoji query at the composer cursor", () => {
    expect(findActiveChatEmojiQuery("send :smi", 9, null)).toEqual({
      query: "smi",
      normalizedQuery: "smi",
      tokenStart: 5,
      cursor: 9,
    });
    expect(findActiveChatEmojiQuery("send :smi now", 13, null)).toBeNull();
    expect(findActiveChatEmojiQuery("send :smi", 9, "editing-id")).toBeNull();
  });

  test("matches Slack-style shortcode aliases", () => {
    const query = findActiveChatEmojiQuery("attack :joy", 11, null);
    const matches = findChatEmojiMatches(query);

    expect(matches[0]).toMatchObject({
      shortcode: "joy",
      unicode: "😂",
    });
  });

  test("matches prefixes and labels without returning an unbounded list", () => {
    const query = findActiveChatEmojiQuery("attack :flag", 12, null);
    const matches = findChatEmojiMatches(query);

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThanOrEqual(12);
    expect(matches.some((option) => option.shortcode.startsWith("flag"))).toBe(true);
  });
});
