import { describe, expect, test } from "bun:test";
import { MapPanZoomInteractionController } from "./use-map-pan-zoom-interaction";

const rect = { left: 0, top: 0, width: 1000, height: 750 };

describe("MapPanZoomInteractionController", () => {
  test("tap without movement does not suppress click", () => {
    const controller = new MapPanZoomInteractionController();

    controller.onPointerDown({
      pointerId: 1,
      pointerType: "touch",
      clientX: 120,
      clientY: 180,
      rect,
      nowMs: 0,
    });
    controller.onPointerUp({
      pointerId: 1,
      pointerType: "touch",
      clientX: 120,
      clientY: 180,
      rect,
      nowMs: 80,
    });

    expect(controller.shouldSuppressClick(90)).toBe(false);
  });

  test("long press and drag pans and suppresses click", () => {
    const controller = new MapPanZoomInteractionController();

    controller.onPointerDown({
      pointerId: 1,
      pointerType: "touch",
      clientX: 200,
      clientY: 200,
      rect,
      nowMs: 0,
    });
    controller.onPointerMove({
      pointerId: 1,
      pointerType: "touch",
      clientX: 218,
      clientY: 235,
      rect,
      nowMs: 220,
    });
    controller.onPointerUp({
      pointerId: 1,
      pointerType: "touch",
      clientX: 218,
      clientY: 235,
      rect,
      nowMs: 260,
    });

    const pan = controller.getPan();
    expect(pan.x).not.toBe(0);
    expect(pan.y).not.toBe(0);
    expect(controller.shouldSuppressClick(300)).toBe(true);
  });

  test("pinch updates bounded scale and adjusts pan", () => {
    const controller = new MapPanZoomInteractionController({ maxScale: 3 });

    controller.onPointerDown({
      pointerId: 1,
      pointerType: "touch",
      clientX: 200,
      clientY: 200,
      rect,
      nowMs: 0,
    });
    controller.onPointerDown({
      pointerId: 2,
      pointerType: "touch",
      clientX: 300,
      clientY: 200,
      rect,
      nowMs: 10,
    });

    controller.onPointerMove({
      pointerId: 2,
      pointerType: "touch",
      clientX: 520,
      clientY: 200,
      rect,
      nowMs: 25,
    });

    expect(controller.getScale()).toBeLessThanOrEqual(3);
    expect(controller.getScale()).toBeGreaterThan(1);
    expect(controller.getPan().x).not.toBe(0);
  });

  test("pointer up cleanup resets gesture active state", () => {
    const controller = new MapPanZoomInteractionController();

    controller.onPointerDown({
      pointerId: 1,
      pointerType: "mouse",
      clientX: 300,
      clientY: 300,
      rect,
      nowMs: 0,
    });
    controller.onPointerMove({
      pointerId: 1,
      pointerType: "mouse",
      clientX: 340,
      clientY: 360,
      rect,
      nowMs: 5,
    });
    expect(controller.isGestureActive()).toBe(true);
    controller.onPointerUp({
      pointerId: 1,
      pointerType: "mouse",
      clientX: 340,
      clientY: 360,
      rect,
      nowMs: 15,
    });
    expect(controller.isGestureActive()).toBe(false);
  });

  test("click suppression window expires", () => {
    const controller = new MapPanZoomInteractionController({ clickSuppressWindowMs: 160 });

    controller.onPointerDown({
      pointerId: 1,
      pointerType: "mouse",
      clientX: 100,
      clientY: 100,
      rect,
      nowMs: 0,
    });
    controller.onPointerMove({
      pointerId: 1,
      pointerType: "mouse",
      clientX: 140,
      clientY: 140,
      rect,
      nowMs: 20,
    });
    controller.onPointerUp({
      pointerId: 1,
      pointerType: "mouse",
      clientX: 140,
      clientY: 140,
      rect,
      nowMs: 30,
    });

    expect(controller.shouldSuppressClick(120)).toBe(true);
    expect(controller.shouldSuppressClick(195)).toBe(false);
  });
});
