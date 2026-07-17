import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

export interface MagneticPoint {
  id: string;
  x: number;
  y: number;
  initialX?: number;
  initialY?: number;
  label: string;
  ariaLabel: string;
  markerStyle?: CSSProperties;
  size?: number;
}

export interface MagneticPointTuning {
  reach: number;
  separation: number;
  responsiveness: number;
}

interface MagneticPointFieldProps {
  points: MagneticPoint[];
  selectedId: string;
  onSelect: (id: string) => void;
  tuning?: Partial<MagneticPointTuning>;
  interactive?: boolean;
}

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const DEFAULT_TUNING: MagneticPointTuning = { reach: 50, separation: 50, responsiveness: 50 };
const interpolate = (low: number, high: number, amount: number) => low + (high - low) * Math.max(0, Math.min(100, amount)) / 100;

function resolvePhysics(tuning: MagneticPointTuning) {
  return {
    tether: interpolate(2, 12, tuning.reach),
    halo: interpolate(42, 74, tuning.reach),
    capture: interpolate(48, 80, tuning.reach),
    spacing: interpolate(20, 40, tuning.separation),
    repulsion: interpolate(0.025, 0.065, tuning.separation),
    collision: interpolate(0.008, 0.028, tuning.separation),
    attraction: interpolate(0.07, 0.15, tuning.responsiveness),
    spring: interpolate(0.04, 0.1, tuning.responsiveness),
    damping: interpolate(0.84, 0.64, tuning.responsiveness),
    switchDelay: 30,
  };
}

export function MagneticPointField({ points, selectedId, onSelect, tuning, interactive = true }: MagneticPointFieldProps) {
  const resolvedTuning = useMemo(() => ({ ...DEFAULT_TUNING, ...tuning }), [tuning]);
  const physics = useMemo(() => resolvePhysics(resolvedTuning), [resolvedTuning]);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const pointRefs = useRef(new Map<string, HTMLDivElement>());
  const bodiesRef = useRef(new Map<string, Body>());
  const cursorRef = useRef({ x: 0, y: 0, inside: false });
  const focusedRef = useRef<string | null>(null);
  const keyboardFocusedRef = useRef<string | null>(null);
  const candidateRef = useRef<{ id: string; since: number } | null>(null);

  useLayoutEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (now: number) => {
      const bounds = fieldRef.current?.getBoundingClientRect();
      if (!bounds) { frame = requestAnimationFrame(tick); return; }
      const step = Math.min(1.6, (now - previous) / 16.67);
      previous = now;
      const bodies = bodiesRef.current;
      const ids = new Set(points.map((point) => point.id));
      for (const id of bodies.keys()) if (!ids.has(id)) bodies.delete(id);
      for (const point of points) {
        if (!bodies.has(point.id)) bodies.set(point.id, {
          x: (point.initialX ?? point.x) / 100 * bounds.width,
          y: (point.initialY ?? point.y) / 100 * bounds.height,
          vx: 0,
          vy: 0,
        });
      }

      const cursor = cursorRef.current;
      const distances = points.map((point) => {
        const body = bodies.get(point.id)!;
        return { id: point.id, distance: Math.hypot(cursor.x - body.x, cursor.y - body.y) };
      }).sort((a, b) => a.distance - b.distance);
      const nearest = distances[0];
      const currentDistance = distances.find((item) => item.id === focusedRef.current)?.distance ?? Infinity;
      const keyboardFocusedId = keyboardFocusedRef.current;
      if (!interactive) {
        candidateRef.current = null;
        if (focusedRef.current !== null) { focusedRef.current = null; setFocusedId(null); }
      } else if (keyboardFocusedId && ids.has(keyboardFocusedId)) {
        candidateRef.current = null;
        if (focusedRef.current !== keyboardFocusedId) { focusedRef.current = keyboardFocusedId; setFocusedId(keyboardFocusedId); }
      } else if (!cursor.inside || !nearest || nearest.distance > physics.capture) {
        candidateRef.current = null;
        if (focusedRef.current !== null) { focusedRef.current = null; setFocusedId(null); }
      } else if (focusedRef.current === null) {
        focusedRef.current = nearest.id;
        setFocusedId(nearest.id);
      } else if (nearest.id !== focusedRef.current && (nearest.distance + 8 < currentDistance || currentDistance > 48)) {
        if (candidateRef.current?.id !== nearest.id) candidateRef.current = { id: nearest.id, since: now };
        else if (now - candidateRef.current.since >= physics.switchDelay) {
          focusedRef.current = nearest.id;
          candidateRef.current = null;
          setFocusedId(nearest.id);
        }
      } else candidateRef.current = null;

      const staticMotion = reducedMotion;
      const activeId = focusedRef.current;
      const activeBody = activeId ? bodies.get(activeId) : undefined;
      const forces = points.map((point, index) => {
        const body = bodies.get(point.id)!;
        const anchorX = point.x / 100 * bounds.width;
        const anchorY = point.y / 100 * bounds.height;
        let fx = (anchorX - body.x) * physics.spring;
        let fy = (anchorY - body.y) * physics.spring;
        if (!staticMotion && !keyboardFocusedId && cursor.inside && point.id === activeId) {
          const cursorFromAnchorX = cursor.x - anchorX;
          const cursorFromAnchorY = cursor.y - anchorY;
          const cursorFromAnchorDistance = Math.hypot(cursorFromAnchorX, cursorFromAnchorY);
          const leashScale = cursorFromAnchorDistance > physics.tether ? physics.tether / cursorFromAnchorDistance : 1;
          fx += (anchorX + cursorFromAnchorX * leashScale - body.x) * physics.attraction;
          fy += (anchorY + cursorFromAnchorY * leashScale - body.y) * physics.attraction;
        } else if (!staticMotion && interactive && activeBody) {
          const fieldX = body.x - activeBody.x;
          const fieldY = body.y - activeBody.y;
          const fieldDistance = Math.hypot(fieldX, fieldY);
          if (fieldDistance < physics.halo) {
            const angle = fieldDistance < 1 ? index * 2.37 : Math.atan2(fieldY, fieldX);
            const strength = (physics.halo - fieldDistance) * physics.repulsion;
            fx += Math.cos(angle) * strength;
            fy += Math.sin(angle) * strength;
          }
        }
        if (!staticMotion && interactive) for (const other of points) {
          if (other.id === point.id) continue;
          const otherBody = bodies.get(other.id)!;
          const dx = body.x - otherBody.x;
          const dy = body.y - otherBody.y;
          const distance = Math.hypot(dx, dy);
          if (distance < physics.spacing) {
            const angle = distance < 1 ? index * 2.37 : Math.atan2(dy, dx);
            const force = (physics.spacing - distance) * physics.collision;
            fx += Math.cos(angle) * force;
            fy += Math.sin(angle) * force;
          }
        }
        return { fx, fy };
      });
      for (let index = 0; index < points.length; index++) {
        const point = points[index]!;
        const body = bodies.get(point.id)!;
        const anchorX = point.x / 100 * bounds.width;
        const anchorY = point.y / 100 * bounds.height;
        const { fx, fy } = forces[index]!;
        body.vx = staticMotion ? 0 : (body.vx + fx * step) * Math.pow(physics.damping, step);
        body.vy = staticMotion ? 0 : (body.vy + fy * step) * Math.pow(physics.damping, step);
        body.x = staticMotion ? anchorX : body.x + body.vx * step;
        body.y = staticMotion ? anchorY : body.y + body.vy * step;
        pointRefs.current.get(point.id)?.style.setProperty("transform", `translate3d(${body.x}px, ${body.y}px, 0)`);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [interactive, physics, points]);

  const trackPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = fieldRef.current?.getBoundingClientRect();
    if (!bounds) return;
    cursorRef.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, inside: true };
  };

  return <div ref={fieldRef} className={`absolute inset-0 z-10 ${interactive ? "" : "pointer-events-none"}`} onPointerMove={trackPointer} onPointerLeave={() => { cursorRef.current.inside = false; }}>
    {points.map((point) => {
      const focused = focusedId === point.id;
      const size = point.size ?? 16;
      const labelPosition = point.x < 18 ? "left-0" : point.x > 82 ? "right-0" : "left-1/2 -translate-x-1/2";
      return <div key={point.id} ref={(node) => { if (node) pointRefs.current.set(point.id, node); else pointRefs.current.delete(point.id); }} className={`absolute left-0 top-0 [will-change:transform] ${focused ? "z-40" : "z-10"}`}>
        {focused && <span className={`pointer-events-none absolute bottom-3.5 z-50 whitespace-nowrap rounded border border-border bg-background px-2 py-1 text-[10px] font-semibold shadow-lg ${labelPosition}`}>{point.label}</span>}
        <button type="button" disabled={!interactive} aria-label={point.ariaLabel} onClick={() => onSelect(point.id)} onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) { keyboardFocusedRef.current = point.id; focusedRef.current = point.id; setFocusedId(point.id); } }} onBlur={() => { if (keyboardFocusedRef.current === point.id) keyboardFocusedRef.current = null; if (!cursorRef.current.inside) { focusedRef.current = null; setFocusedId(null); } }} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-md transition-transform ${focused ? "scale-125 ring-2 ring-foreground/50 ring-offset-2 ring-offset-background" : ""} ${selectedId === point.id ? "outline outline-1 outline-foreground/50" : ""}`} style={{ width: size, height: size, ...point.markerStyle }} />
      </div>;
    })}
  </div>;
}
