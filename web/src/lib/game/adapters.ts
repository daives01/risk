import type { GraphMap } from "risk-engine";
import type { HandCard, MapVisual, PublicState } from "@/lib/game/types";

type ViewLike = {
  players?: Array<{ displayName: string; enginePlayerId: string | null; color?: string | null }>;
  state?: unknown;
  mapId?: string;
  status?: string;
  winningPlayerId?: string | null;
  winningTeamId?: string | null;
  teamModeEnabled?: boolean;
  teamCount?: number | null;
  teamNames?: Record<string, string> | null;
  effectiveRuleset?: unknown;
};

type PlayerViewLike = ViewLike & {
  myEnginePlayerId?: string | null;
  myHand?: HandCard[] | null;
};

type MapDocLike = {
  graphMap?: GraphMap;
  visual?: MapVisual;
  imageUrl?: string | null;
};

export function adaptView(playerView: unknown, publicView: unknown) {
  const resolvedPlayerView = (playerView ?? null) as PlayerViewLike | null;
  const resolvedPublicView = (publicView ?? null) as ViewLike | null;
  const view = (resolvedPlayerView ?? resolvedPublicView) as ViewLike | null;

  return {
    view,
    myEnginePlayerId: resolvedPlayerView?.myEnginePlayerId ?? null,
    myHand: resolvedPlayerView?.myHand ?? null,
    playerMap: view?.players ?? [],
    state: (view?.state ?? null) as PublicState | null,
  };
}

export function adaptMapDoc(mapDoc: unknown) {
  const resolved = (mapDoc ?? null) as MapDocLike | null;
  const visual = resolved?.visual
    ? {
      ...resolved.visual,
      nodeScale:
        typeof resolved.visual.nodeScale === "number" &&
          Number.isFinite(resolved.visual.nodeScale) &&
          resolved.visual.nodeScale > 0
          ? resolved.visual.nodeScale
          : 1,
    }
    : undefined;
  return {
    graphMap: resolved?.graphMap,
    mapVisual: visual,
    mapImageUrl: resolved?.imageUrl ?? null,
  };
}
