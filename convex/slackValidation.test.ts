import { expect, test } from "bun:test";
import {
  normalizeChannelId,
  normalizeSlackUserId,
  normalizeTeamId,
} from "./slackValidation";

test("normalizes valid slack IDs", () => {
  expect(normalizeTeamId(" t123abc ")).toBe("T123ABC");
  expect(normalizeChannelId(" c09xyz ")).toBe("C09XYZ");
  expect(normalizeSlackUserId(" u44abc ")).toBe("U44ABC");
});

test("rejects invalid slack IDs", () => {
  expect(() => normalizeTeamId("ABC")).toThrow("Invalid Slack workspace ID");
  expect(() => normalizeChannelId("U123")).toThrow("Invalid Slack channel ID");
  expect(() => normalizeSlackUserId("C123")).toThrow("Invalid Slack user ID");
});
