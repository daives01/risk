import { describe, expect, test } from "bun:test";
import { computeBattleOverlayPlacement } from "./battle-overlay-placement";

const pointInsideRect = (
  point: { x: number; y: number },
  center: { x: number; y: number },
  size: { width: number; height: number },
) =>
  point.x >= center.x - size.width / 2 &&
  point.x <= center.x + size.width / 2 &&
  point.y >= center.y - size.height / 2 &&
  point.y <= center.y + size.height / 2;

describe("computeBattleOverlayPlacement", () => {
  test("anchors next to the territory closer to the center", () => {
    const panelSize = { width: 0.24, height: 0.14 };
    const placement = computeBattleOverlayPlacement({
      from: { x: 0.18, y: 0.5 },
      to: { x: 0.45, y: 0.5 },
      panelSize,
      markerRadius: 0.03,
    });

    expect(Math.abs(placement.x - 0.45)).toBeLessThan(Math.abs(placement.x - 0.18));
    expect(placement.x).toBeGreaterThan(0.45);
  });

  test("keeps a large overlay clear of the selected territories", () => {
    const panelSize = { width: 0.3, height: 0.18 };
    const placement = computeBattleOverlayPlacement({
      from: { x: 0.42, y: 0.5 },
      to: { x: 0.58, y: 0.5 },
      panelSize,
      nearbyAnchors: [{ x: 0.5, y: 0.78 }],
      markerRadius: 0.03,
    });

    expect(pointInsideRect({ x: 0.42, y: 0.5 }, placement, panelSize)).toBe(false);
    expect(pointInsideRect({ x: 0.58, y: 0.5 }, placement, panelSize)).toBe(false);
  });

  test("places away from the other territory when there is room", () => {
    const placement = computeBattleOverlayPlacement({
      from: { x: 0.35, y: 0.48 },
      to: { x: 0.58, y: 0.48 },
      panelSize: { width: 0.24, height: 0.16 },
      markerRadius: 0.03,
    });

    expect(placement.x).toBeGreaterThan(0.58);
    expect(Math.abs(placement.y - 0.48)).toBeLessThan(0.08);
  });

  test("stays within bounds when the panel is near the edge", () => {
    const panelSize = { width: 0.28, height: 0.18 };
    const placement = computeBattleOverlayPlacement({
      from: { x: 0.12, y: 0.2 },
      to: { x: 0.22, y: 0.3 },
      panelSize,
      markerRadius: 0.03,
    });

    expect(placement.x - panelSize.width / 2).toBeGreaterThanOrEqual(0.03);
    expect(placement.y - panelSize.height / 2).toBeGreaterThanOrEqual(0.03);
    expect(placement.x + panelSize.width / 2).toBeLessThanOrEqual(0.97);
    expect(placement.y + panelSize.height / 2).toBeLessThanOrEqual(0.97);
  });
});
