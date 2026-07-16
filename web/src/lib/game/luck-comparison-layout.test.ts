import { describe, expect, test } from "bun:test";
import { assignLuckLabelRows } from "./luck-comparison-layout";

describe("luck comparison layout", () => {
  test("places nearby team labels on separate rows so every name stays visible", () => {
    const rows = assignLuckLabelRows([
      { id: "backbone", left: 15 },
      { id: "leftovers", left: 18 },
      { id: "test-in-prod", left: 54 },
      { id: "warriors", left: 61 },
      { id: "borders", left: 90 },
    ]);

    expect(rows.size).toBe(5);
    expect(rows.get("backbone")).not.toBe(rows.get("leftovers"));
    expect(rows.get("test-in-prod")).not.toBe(rows.get("warriors"));
  });

  test("separates labels whose teams have the same luck score", () => {
    const rows = assignLuckLabelRows([
      { id: "one", left: 50 },
      { id: "two", left: 50 },
    ]);

    expect(rows.get("one")).not.toBe(rows.get("two"));
  });
});
