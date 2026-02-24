/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { getReadableTextColor } from "./color-contrast";

describe("getReadableTextColor", () => {
  test("returns black text for light backgrounds", () => {
    expect(getReadableTextColor("#aafb00")).toBe("#000000");
    expect(getReadableTextColor("#209600")).toBe("#000000");
  });

  test("returns white text for darker backgrounds", () => {
    expect(getReadableTextColor("#08008a")).toBe("#ffffff");
    expect(getReadableTextColor("#593500")).toBe("#ffffff");
  });
});
