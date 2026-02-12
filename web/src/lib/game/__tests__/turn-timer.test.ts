/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { formatTurnTimer } from "../turn-timer";

describe("formatTurnTimer", () => {
  test("rounds to nearest hour", () => {
    expect(formatTurnTimer(29 * 60 * 1000)).toBe("0hr");
    expect(formatTurnTimer(31 * 60 * 1000)).toBe("1hr");
  });

  test("formats day and hour boundaries", () => {
    expect(formatTurnTimer(24 * 60 * 60 * 1000)).toBe("1d");
    expect(formatTurnTimer(25 * 60 * 60 * 1000)).toBe("1d 1hr");
    expect(formatTurnTimer(48 * 60 * 60 * 1000)).toBe("2d");
  });
});
