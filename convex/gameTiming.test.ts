import { describe, expect, test } from "bun:test";
import { computeTurnDeadlineAt } from "./gameTiming";

describe("game timing", () => {
  test("1 day deadline without weekend exclusion", () => {
    const friday1700Utc = Date.UTC(2026, 1, 6, 17, 0, 0, 0);
    const deadline = computeTurnDeadlineAt(friday1700Utc, "async_1d", false);
    expect(deadline).toBe(Date.UTC(2026, 1, 7, 17, 0, 0, 0));
  });

  test("1 day deadline skips weekend when enabled", () => {
    const friday1700Utc = Date.UTC(2026, 1, 6, 17, 0, 0, 0);
    const deadline = computeTurnDeadlineAt(friday1700Utc, "async_1d", true);
    expect(deadline).toBe(Date.UTC(2026, 1, 9, 17, 0, 0, 0));
  });

  test("3 day deadline skips weekend when enabled", () => {
    const thursday1200Utc = Date.UTC(2026, 1, 5, 12, 0, 0, 0);
    const deadline = computeTurnDeadlineAt(thursday1200Utc, "async_3d", true);
    expect(deadline).toBe(Date.UTC(2026, 1, 10, 12, 0, 0, 0));
  });
});
