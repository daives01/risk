import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

type Point = { x: number; y: number };
type Rect = { left: number; top: number; width: number; height: number };

type PointerType = "mouse" | "touch" | "pen";

interface PointerSnapshot {
  pointerId: number;
  pointerType: PointerType;
  clientX: number;
  clientY: number;
  rect: Rect;
  nowMs: number;
}

interface WheelSnapshot {
  deltaY: number;
  clientX: number;
  clientY: number;
  rect: Rect;
}

interface MapPanZoomInteractionControllerOptions {
  minScale?: number;
  maxScale?: number;
  initialScale?: number;
  zoomStep?: number;
  longPressMs?: number;
  dragThresholdPx?: number;
  clickSuppressWindowMs?: number;
}

interface PointerData {
  pointerType: PointerType;
  clientX: number;
  clientY: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export class MapPanZoomInteractionController {
  private readonly minScale: number;
  private readonly maxScale: number;
  private readonly initialScale: number;
  private readonly zoomStep: number;
  private readonly longPressMs: number;
  private readonly dragThresholdPx: number;
  private readonly clickSuppressWindowMs: number;

  private scale: number;
  private pan: Point = { x: 0, y: 0 };
  private suppressClicksUntil = 0;

  private pointers = new Map<number, PointerData>();
  private interactivePointerIds = new Set<number>();
  private gestureMode: "none" | "pending_touch_pan" | "pan" | "pinch" = "none";

  private pendingTouch:
    | {
      pointerId: number;
      startX: number;
      startY: number;
      startAtMs: number;
      panOrigin: Point;
      movedBeyondThreshold: boolean;
    }
    | null = null;

  private activePan:
    | {
      pointerId: number;
      startX: number;
      startY: number;
      panOrigin: Point;
      moved: boolean;
    }
    | null = null;

  private pinchStart:
    | {
      distance: number;
      center: Point;
      scale: number;
      pan: Point;
    }
    | null = null;

  constructor(options: MapPanZoomInteractionControllerOptions = {}) {
    this.minScale = options.minScale ?? 1;
    this.maxScale = options.maxScale ?? 4;
    this.initialScale = options.initialScale ?? 1;
    this.zoomStep = options.zoomStep ?? 0.2;
    this.longPressMs = options.longPressMs ?? 180;
    this.dragThresholdPx = options.dragThresholdPx ?? 6;
    this.clickSuppressWindowMs = options.clickSuppressWindowMs ?? 160;

    this.scale = this.initialScale;
  }

  getScale() {
    return this.scale;
  }

  getPan() {
    return this.pan;
  }

  isGestureActive() {
    return this.gestureMode === "pan" || this.gestureMode === "pinch";
  }

  markInteractiveTargetPointerDown(pointerId: number) {
    this.interactivePointerIds.add(pointerId);
  }

  shouldSuppressClick(nowMs: number) {
    return nowMs < this.suppressClicksUntil;
  }

  reset() {
    this.scale = this.initialScale;
    this.pan = { x: 0, y: 0 };
    this.resetGestureState();
  }

  zoomIn(rect: Rect) {
    this.zoomBy(1, rect);
  }

  zoomOut(rect: Rect) {
    this.zoomBy(-1, rect);
  }

  onWheel(event: WheelSnapshot) {
    const direction: 1 | -1 = event.deltaY < 0 ? 1 : -1;
    this.zoomAtPoint(this.scale + direction * this.zoomStep, event.clientX, event.clientY, event.rect);
  }

  onPointerDown(event: PointerSnapshot) {
    if (this.interactivePointerIds.has(event.pointerId)) {
      this.interactivePointerIds.delete(event.pointerId);
      return false;
    }

    this.pointers.set(event.pointerId, {
      pointerType: event.pointerType,
      clientX: event.clientX,
      clientY: event.clientY,
    });

    if (this.pointers.size === 2) {
      this.beginPinch(event.rect);
      return true;
    }

    if (this.pointers.size !== 1) return true;

    if (event.pointerType === "touch") {
      this.gestureMode = "pending_touch_pan";
      this.pendingTouch = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startAtMs: event.nowMs,
        panOrigin: this.pan,
        movedBeyondThreshold: false,
      };
      return true;
    }

    this.gestureMode = "pan";
    this.activePan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panOrigin: this.pan,
      moved: false,
    };
    return true;
  }

  onPointerMove(event: PointerSnapshot) {
    const existing = this.pointers.get(event.pointerId);
    if (!existing) return;

    existing.clientX = event.clientX;
    existing.clientY = event.clientY;

    if (this.pointers.size === 2 && this.pinchStart) {
      const points = [...this.pointers.values()];
      const a = points[0];
      const b = points[1];
      if (!a || !b) return;

      const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const center = {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      };
      const pinch = this.pinchStart;
      const distanceRatio = pinch.distance > 0 ? distance / pinch.distance : 1;
      const nextScale = clamp(pinch.scale * distanceRatio, this.minScale, this.maxScale);

      const localX = pinch.center.x - event.rect.left;
      const localY = pinch.center.y - event.rect.top;
      const contentX = (localX - pinch.pan.x) / pinch.scale;
      const contentY = (localY - pinch.pan.y) / pinch.scale;

      this.scale = nextScale;
      this.pan = {
        x: center.x - event.rect.left - contentX * nextScale,
        y: center.y - event.rect.top - contentY * nextScale,
      };
      return;
    }

    if (this.gestureMode === "pending_touch_pan" && this.pendingTouch && this.pendingTouch.pointerId === event.pointerId) {
      const dx = event.clientX - this.pendingTouch.startX;
      const dy = event.clientY - this.pendingTouch.startY;
      const moved = Math.hypot(dx, dy);
      if (moved >= this.dragThresholdPx) {
        this.pendingTouch.movedBeyondThreshold = true;
      }

      const heldLongEnough = event.nowMs - this.pendingTouch.startAtMs >= this.longPressMs;
      if (this.pendingTouch.movedBeyondThreshold && heldLongEnough) {
        this.gestureMode = "pan";
        this.activePan = {
          pointerId: event.pointerId,
          startX: this.pendingTouch.startX,
          startY: this.pendingTouch.startY,
          panOrigin: this.pendingTouch.panOrigin,
          moved: true,
        };
        this.pan = {
          x: this.pendingTouch.panOrigin.x + dx,
          y: this.pendingTouch.panOrigin.y + dy,
        };
      }
      return;
    }

    if (this.gestureMode === "pan" && this.activePan && this.activePan.pointerId === event.pointerId) {
      const dx = event.clientX - this.activePan.startX;
      const dy = event.clientY - this.activePan.startY;
      if (Math.hypot(dx, dy) >= this.dragThresholdPx) {
        this.activePan.moved = true;
      }
      this.pan = {
        x: this.activePan.panOrigin.x + dx,
        y: this.activePan.panOrigin.y + dy,
      };
    }
  }

  onPointerUp(event: PointerSnapshot) {
    this.pointers.delete(event.pointerId);
    this.interactivePointerIds.delete(event.pointerId);

    if (this.gestureMode === "pinch") {
      if (this.pointers.size < 2) {
        this.suppressClicksUntil = event.nowMs + this.clickSuppressWindowMs;
        this.resetGestureState();
      }
      return;
    }

    if (this.gestureMode === "pan" && this.activePan?.pointerId === event.pointerId) {
      if (this.activePan.moved) {
        this.suppressClicksUntil = event.nowMs + this.clickSuppressWindowMs;
      }
      this.resetGestureState();
      return;
    }

    if (this.gestureMode === "pending_touch_pan" && this.pendingTouch?.pointerId === event.pointerId) {
      if (this.pendingTouch.movedBeyondThreshold) {
        this.suppressClicksUntil = event.nowMs + this.clickSuppressWindowMs;
      }
      this.resetGestureState();
      return;
    }

    if (this.pointers.size === 0) {
      this.resetGestureState();
    }
  }

  private beginPinch(rect: Rect) {
    const points = [...this.pointers.values()];
    const a = points[0];
    const b = points[1];
    if (!a || !b) return;

    this.gestureMode = "pinch";
    this.pendingTouch = null;
    this.activePan = null;
    this.pinchStart = {
      distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
      center: {
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      },
      scale: this.scale,
      pan: this.pan,
    };

    if (rect.width <= 0 || rect.height <= 0) {
      this.resetGestureState();
    }
  }

  private zoomBy(direction: 1 | -1, rect: Rect) {
    this.zoomAtPoint(
      this.scale + direction * this.zoomStep,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      rect,
    );
  }

  private zoomAtPoint(nextScaleRaw: number, clientX: number, clientY: number, rect: Rect) {
    if (rect.width <= 0 || rect.height <= 0) return;
    const nextScale = clamp(nextScaleRaw, this.minScale, this.maxScale);
    if (nextScale === this.scale) return;

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const contentX = (localX - this.pan.x) / this.scale;
    const contentY = (localY - this.pan.y) / this.scale;

    this.scale = nextScale;
    this.pan = {
      x: localX - contentX * nextScale,
      y: localY - contentY * nextScale,
    };
  }

  private resetGestureState() {
    this.gestureMode = "none";
    this.pendingTouch = null;
    this.activePan = null;
    this.pinchStart = null;
    if (this.pointers.size === 0) {
      this.interactivePointerIds.clear();
    }
  }
}

interface UseMapPanZoomInteractionOptions extends MapPanZoomInteractionControllerOptions {
  enabled: boolean;
}

export function useMapPanZoomInteraction({
  enabled,
  minScale = 1,
  maxScale = 4,
  initialScale = 1,
  zoomStep = 0.2,
  longPressMs = 180,
  dragThresholdPx = 6,
  clickSuppressWindowMs = 160,
}: UseMapPanZoomInteractionOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MapPanZoomInteractionController | null>(null);
  const [viewState, setViewState] = useState<{ scale: number; pan: Point }>({
    scale: initialScale,
    pan: { x: 0, y: 0 },
  });
  const [isGestureActive, setIsGestureActive] = useState(false);

  if (controllerRef.current == null) {
    controllerRef.current = new MapPanZoomInteractionController({
      minScale,
      maxScale,
      initialScale,
      zoomStep,
      longPressMs,
      dragThresholdPx,
      clickSuppressWindowMs,
    });
  }

  const commitState = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    setViewState({ scale: controller.getScale(), pan: controller.getPan() });
    setIsGestureActive(controller.isGestureActive());
  }, []);

  const withRect = useCallback(() => {
    const node = containerRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }, []);

  const handleReset = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.reset();
    commitState();
  }, [commitState]);

  const handleZoomIn = useCallback(() => {
    if (!enabled) return;
    const controller = controllerRef.current;
    const rect = withRect();
    if (!controller || !rect) return;
    controller.zoomIn(rect);
    commitState();
  }, [commitState, enabled, withRect]);

  const handleZoomOut = useCallback(() => {
    if (!enabled) return;
    const controller = controllerRef.current;
    const rect = withRect();
    if (!controller || !rect) return;
    controller.zoomOut(rect);
    commitState();
  }, [commitState, enabled, withRect]);

  const shouldSuppressClick = useCallback(() => {
    if (!enabled) return false;
    const controller = controllerRef.current;
    if (!controller) return false;
    return controller.shouldSuppressClick(Date.now());
  }, [enabled]);

  const markInteractiveTargetPointerDown = useCallback((pointerId: number) => {
    if (!enabled) return;
    controllerRef.current?.markInteractiveTargetPointerDown(pointerId);
  }, [enabled]);

  const bindViewportHandlers = useMemo(() => {
    if (!enabled) return {};

    return {
      onWheel: (event: ReactWheelEvent<HTMLDivElement>) => {
        if (event.defaultPrevented) return;
        const rect = withRect();
        if (!rect) return;
        const controller = controllerRef.current;
        if (!controller) return;
        event.preventDefault();
        event.stopPropagation();
        controller.onWheel({
          deltaY: event.deltaY,
          clientX: event.clientX,
          clientY: event.clientY,
          rect,
        });
        commitState();
      },
      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
        const rect = withRect();
        const controller = controllerRef.current;
        if (!rect || !controller) return;
        const shouldCapture = controller.onPointerDown({
          pointerId: event.pointerId,
          pointerType: event.pointerType as PointerType,
          clientX: event.clientX,
          clientY: event.clientY,
          rect,
          nowMs: Date.now(),
        });
        commitState();
        if (shouldCapture) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      },
      onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
        const rect = withRect();
        const controller = controllerRef.current;
        if (!rect || !controller) return;
        controller.onPointerMove({
          pointerId: event.pointerId,
          pointerType: event.pointerType as PointerType,
          clientX: event.clientX,
          clientY: event.clientY,
          rect,
          nowMs: Date.now(),
        });
        commitState();
      },
      onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
        const rect = withRect();
        const controller = controllerRef.current;
        if (!rect || !controller) return;
        controller.onPointerUp({
          pointerId: event.pointerId,
          pointerType: event.pointerType as PointerType,
          clientX: event.clientX,
          clientY: event.clientY,
          rect,
          nowMs: Date.now(),
        });
        commitState();
      },
      onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => {
        const rect = withRect();
        const controller = controllerRef.current;
        if (!rect || !controller) return;
        controller.onPointerUp({
          pointerId: event.pointerId,
          pointerType: event.pointerType as PointerType,
          clientX: event.clientX,
          clientY: event.clientY,
          rect,
          nowMs: Date.now(),
        });
        commitState();
      },
      onPointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== "mouse") return;
        const rect = withRect();
        const controller = controllerRef.current;
        if (!rect || !controller) return;
        controller.onPointerUp({
          pointerId: event.pointerId,
          pointerType: event.pointerType as PointerType,
          clientX: event.clientX,
          clientY: event.clientY,
          rect,
          nowMs: Date.now(),
        });
        commitState();
      },
    };
  }, [commitState, enabled, withRect]);

  const transformStyle = useMemo(
    () => ({
      transform: `translate(${viewState.pan.x}px, ${viewState.pan.y}px) scale(${viewState.scale})`,
      transformOrigin: "0 0",
    }),
    [viewState.pan.x, viewState.pan.y, viewState.scale],
  );

  return {
    containerRef,
    scale: viewState.scale,
    transformStyle,
    isGestureActive,
    zoomIn: handleZoomIn,
    zoomOut: handleZoomOut,
    reset: handleReset,
    bindViewportHandlers,
    markInteractiveTargetPointerDown,
    shouldSuppressClick,
  };
}
