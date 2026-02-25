import { expect, test } from "bun:test";
import { buildSlackTurnMessage } from "./slackMessage";

test("builds turn notification text with game link", () => {
  const message = buildSlackTurnMessage({
    gameName: "World Risk",
    gameUrl: "https://example.com/g/123",
    mentionOrName: "<@U123>",
  });
  expect(message).toContain("<@U123>");
  expect(message).toContain("<https://example.com/g/123|World Risk>");
});
