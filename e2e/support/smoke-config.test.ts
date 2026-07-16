import { describe, expect, test } from "bun:test";
import { readSmokeConfig } from "./smoke-config";

describe("Smoke Harness configuration", () => {
  test("reads the canonical origin and four seeded Smoke Users", () => {
    const config = readSmokeConfig({
      SMOKE_ORIGIN: "http://100.64.0.10:5173/",
      SMOKE_USER_ALPHA: "alpha",
      SMOKE_USER_BRAVO: "bravo",
      SMOKE_USER_CHARLIE: "charlie",
      SMOKE_USER_DELTA: "delta",
      SMOKE_USER_PASSWORD: "correct horse battery staple",
    });

    expect(config.origin).toBe("http://100.64.0.10:5173");
    expect(config.users).toEqual([
      { key: "alpha", identifier: "alpha", password: "correct horse battery staple" },
      { key: "bravo", identifier: "bravo", password: "correct horse battery staple" },
      { key: "charlie", identifier: "charlie", password: "correct horse battery staple" },
      { key: "delta", identifier: "delta", password: "correct horse battery staple" },
    ]);
  });

  test("reports every missing required variable together", () => {
    expect(() => readSmokeConfig({})).toThrow(
      "Missing Smoke Harness variables: SMOKE_ORIGIN, SMOKE_USER_ALPHA, SMOKE_USER_BRAVO, SMOKE_USER_CHARLIE, SMOKE_USER_DELTA, SMOKE_USER_PASSWORD",
    );
  });
});
