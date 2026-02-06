import { expect, test } from "bun:test";
import { ENGINE_VERSION } from "risk-engine";

test("workspace import resolves", () => {
  expect(ENGINE_VERSION).toBe("0.0.1");
});
