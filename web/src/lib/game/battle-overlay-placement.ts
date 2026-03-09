export interface OverlayPoint {
  x: number;
  y: number;
}

export interface OverlaySize {
  width: number;
  height: number;
}

export interface BattleOverlayPlacementInput {
  from: OverlayPoint;
  to?: OverlayPoint | null;
  nearbyAnchors?: readonly OverlayPoint[];
  panelSize: OverlaySize;
  markerRadius?: number;
  margin?: number;
}

export interface BattleOverlayPlacement {
  x: number;
  y: number;
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const length = (x: number, y: number) => Math.hypot(x, y);

const normalize = (x: number, y: number) => {
  const magnitude = length(x, y) || 1;
  return { x: x / magnitude, y: y / magnitude };
};

const rectFromCenter = (center: OverlayPoint, size: OverlaySize): Rect => ({
  left: center.x - size.width / 2,
  right: center.x + size.width / 2,
  top: center.y - size.height / 2,
  bottom: center.y + size.height / 2,
});

const distanceToCenter = (point: OverlayPoint) => length(point.x - 0.5, point.y - 0.5);

const projectHalfSize = (direction: OverlayPoint, size: OverlaySize) =>
  Math.abs(direction.x) * (size.width / 2) + Math.abs(direction.y) * (size.height / 2);

const isInsideViewport = (rect: Rect, margin: number) =>
  rect.left >= margin &&
  rect.right <= 1 - margin &&
  rect.top >= margin &&
  rect.bottom <= 1 - margin;

const squaredDistanceFromPointToRect = (point: OverlayPoint, rect: Rect) => {
  const dx = point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0;
  const dy = point.y < rect.top ? rect.top - point.y : point.y > rect.bottom ? point.y - rect.bottom : 0;
  return dx * dx + dy * dy;
};

const isClearOfPoint = (point: OverlayPoint, rect: Rect, radius: number) =>
  squaredDistanceFromPointToRect(point, rect) >= radius * radius;

const samePoint = (a: OverlayPoint, b: OverlayPoint) => a.x === b.x && a.y === b.y;

export function computeBattleOverlayPlacement({
  from,
  to,
  nearbyAnchors = [],
  panelSize,
  markerRadius = 0.035,
  margin = 0.03,
}: BattleOverlayPlacementInput): BattleOverlayPlacement {
  const safePanelSize = {
    width: clamp(panelSize.width || 0.28, 0.16, 0.5),
    height: clamp(panelSize.height || 0.16, 0.1, 0.32),
  };
  const gap = 0.018;
  const keyPoints = to ? [from, to] : [from];
  const nearbyRadius = markerRadius + 0.028;
  const anchor = to && distanceToCenter(to) < distanceToCenter(from) ? to : from;
  const center = { x: 0.5, y: 0.5 };

  const candidateCenters: OverlayPoint[] = [];
  const addCandidateForDirection = (origin: OverlayPoint, direction: OverlayPoint) => {
    const offset = projectHalfSize(direction, safePanelSize) + markerRadius + gap;
    candidateCenters.push({
      x: origin.x + direction.x * offset,
      y: origin.y + direction.y * offset,
    });
  };

  if (!to) {
    addCandidateForDirection(anchor, normalize(center.x - anchor.x, center.y - anchor.y));
  } else {
    const other = anchor === from ? to : from;
    const away = normalize(anchor.x - other.x, anchor.y - other.y);
    const towardCenter = normalize(center.x - anchor.x, center.y - anchor.y);
    const perpendicular = normalize(-away.y, away.x);

    addCandidateForDirection(anchor, away);
    addCandidateForDirection(anchor, normalize(away.x * 0.92 + towardCenter.x * 0.08, away.y * 0.92 + towardCenter.y * 0.08));
    addCandidateForDirection(anchor, normalize(away.x * 0.88 + perpendicular.x * 0.24, away.y * 0.88 + perpendicular.y * 0.24));
    addCandidateForDirection(anchor, normalize(away.x * 0.88 - perpendicular.x * 0.24, away.y * 0.88 - perpendicular.y * 0.24));
    addCandidateForDirection(anchor, towardCenter);
  }

  for (const candidate of candidateCenters) {
    const rect = rectFromCenter(candidate, safePanelSize);
    if (!isInsideViewport(rect, margin)) continue;
    if (!keyPoints.every((point) => isClearOfPoint(point, rect, markerRadius + gap))) continue;
    if (!nearbyAnchors.every((point) => keyPoints.some((keyPoint) => samePoint(keyPoint, point)) || isClearOfPoint(point, rect, nearbyRadius))) continue;
    return candidate;
  }

  const fallbackDirection = to
    ? normalize(center.x - anchor.x, center.y - anchor.y)
    : normalize(center.x - from.x, center.y - from.y);
  const fallbackOffset = projectHalfSize(fallbackDirection, safePanelSize) + markerRadius + gap;
  const fallback = {
    x: clamp(anchor.x + fallbackDirection.x * fallbackOffset, margin + safePanelSize.width / 2, 1 - margin - safePanelSize.width / 2),
    y: clamp(anchor.y + fallbackDirection.y * fallbackOffset, margin + safePanelSize.height / 2, 1 - margin - safePanelSize.height / 2),
  };
  return fallback;
}
