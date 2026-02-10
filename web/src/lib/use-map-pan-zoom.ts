import { useCallback, useMemo, useRef, useState } from "react";

type Point = { x: number; y: number };

interface UseMapPanZoomOptions {
  minScale?: number;
  maxScale?: number;
  initialScale?: number;
  zoomStep?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function useMapPanZoom({
  minScale = 1,
  maxScale = 4,
  initialScale = 1,
  zoomStep = 0.2,
}: UseMapPanZoomOptions = {}) {
  const PAN_DRAG_THRESHOLD_PX = 2;
  const CLICK_SUPPRESS_WINDOW_MS = 150;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const panStartRef = useRef<Point | null>(null);
  const panOriginRef = useRef<Point>({ x: 0, y: 0 });
  const pinchStartRef = useRef<{ distance: number; center: Point; scale: number; pan: Point } | null>(null);
  const movedDuringGestureRef = useRef(false);
  const suppressClicksUntilRef = useRef(0);

  const [scale, setScale] = useState(initialScale);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const zoomAtPoint = useCallback(
    (nextScaleRaw: number, clientX: number, clientY: number) => {
      const node = containerRef.current;
      if (!node) return;

      const rect = node.getBoundingClientRect();
      const nextScale = clamp(nextScaleRaw, minScale, maxScale);
      if (rect.width <= 0 || rect.height <= 0 || nextScale === scale) return;

      const localX = clientX - rect.left;
      const localY = clientY - rect.top;

      const contentX = (localX - pan.x) / scale;
      const contentY = (localY - pan.y) / scale;

      setScale(nextScale);
      setPan({
        x: localX - contentX * nextScale,
        y: localY - contentY * nextScale,
      });
    },
    [maxScale, minScale, pan.x, pan.y, scale],
  );

  const zoomBy = useCallback(
    (direction: 1 | -1) => {
      const node = containerRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      zoomAtPoint(scale + direction * zoomStep, rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    [scale, zoomAtPoint, zoomStep],
  );

  const reset = useCallback(() => {
    setScale(initialScale);
    setPan({ x: 0, y: 0 });
  }, [initialScale]);

  const toNormalized = useCallback(
    (clientX: number, clientY: number) => {
      const node = containerRef.current;
      if (!node) return null;

      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      const contentX = (localX - pan.x) / scale;
      const contentY = (localY - pan.y) / scale;

      return {
        x: clamp(contentX / rect.width, 0, 1),
        y: clamp(contentY / rect.height, 0, 1),
      };
    },
    [pan.x, pan.y, scale],
  );

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const direction: 1 | -1 = event.deltaY < 0 ? 1 : -1;
      zoomAtPoint(scale + direction * zoomStep, event.clientX, event.clientY);
    },
    [scale, zoomAtPoint, zoomStep],
  );

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
    }
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    movedDuringGestureRef.current = false;

    if (pointersRef.current.size === 1) {
      panStartRef.current = point;
      panOriginRef.current = pan;
    }

    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      pinchStartRef.current = {
        distance,
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        scale,
        pan,
      };
      panStartRef.current = null;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }, [pan, scale]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    if (event.pointerType === "touch") {
      event.preventDefault();
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      movedDuringGestureRef.current = true;
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const pinch = pinchStartRef.current;
      const distanceRatio = pinch.distance > 0 ? distance / pinch.distance : 1;
      const nextScale = clamp(pinch.scale * distanceRatio, minScale, maxScale);

      const node = containerRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const localX = pinch.center.x - rect.left;
      const localY = pinch.center.y - rect.top;
      const contentX = (localX - pinch.pan.x) / pinch.scale;
      const contentY = (localY - pinch.pan.y) / pinch.scale;

      setScale(nextScale);
      setPan({
        x: center.x - rect.left - contentX * nextScale,
        y: center.y - rect.top - contentY * nextScale,
      });
      return;
    }

    if (pointersRef.current.size === 1 && panStartRef.current) {
      const dx = event.clientX - panStartRef.current.x;
      const dy = event.clientY - panStartRef.current.y;
      if (!movedDuringGestureRef.current && Math.hypot(dx, dy) >= PAN_DRAG_THRESHOLD_PX) {
        movedDuringGestureRef.current = true;
      }
      setPan({
        x: panOriginRef.current.x + dx,
        y: panOriginRef.current.y + dy,
      });
    }
  }, [maxScale, minScale]);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
    }
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
    if (pointersRef.current.size === 1) {
      const [remaining] = [...pointersRef.current.values()];
      panStartRef.current = remaining;
      panOriginRef.current = pan;
    } else {
      if (movedDuringGestureRef.current) {
        suppressClicksUntilRef.current = Date.now() + CLICK_SUPPRESS_WINDOW_MS;
      }
      panStartRef.current = null;
      setIsDragging(false);
      movedDuringGestureRef.current = false;
    }
  }, [pan]);

  const shouldSuppressClick = useCallback(() => Date.now() < suppressClicksUntilRef.current, []);

  const transformStyle = useMemo(
    () => ({
      transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
      transformOrigin: "0 0",
    }),
    [pan.x, pan.y, scale],
  );

  return {
    containerRef,
    scale,
    pan,
    isDragging,
    transformStyle,
    toNormalized,
    zoomIn: () => zoomBy(1),
    zoomOut: () => zoomBy(-1),
    reset,
    shouldSuppressClick,
    handlers: {
      onWheel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onPointerLeave: onPointerUp,
    },
  };
}
