import type { FunctionReturnType } from 'convex/server'
import type { api } from '@backend/_generated/api'
import { readGraphMap } from '../../../../convex/typeAdapters'

type PlayerView = FunctionReturnType<typeof api.games.getGameViewAsPlayer>

type PublicView = FunctionReturnType<typeof api.games.getGameView>

type MapDoc = FunctionReturnType<typeof api.maps.getByMapId>

export function adaptView(playerView: PlayerView | undefined, publicView: PublicView | undefined) {
  const resolvedPlayerView = playerView ?? null
  const resolvedPublicView = publicView ?? null
  const view = resolvedPlayerView ?? resolvedPublicView

  return {
    view,
    myEnginePlayerId: resolvedPlayerView?.myEnginePlayerId ?? null,
    myHand: resolvedPlayerView?.myHand ?? null,
    teammateHands: resolvedPlayerView?.teammateHands ?? null,
    delegatableTurnHand: resolvedPlayerView?.delegatableTurnHand ?? null,
    playerMap: view?.players ?? [],
    state: view?.state ?? null,
  }
}

export function adaptMapDoc(mapDoc: MapDoc | undefined) {
  const resolved = mapDoc ?? null

  const visual = resolved?.visual
    ? {
        ...resolved.visual,
        nodeScale:
          typeof resolved.visual.nodeScale === 'number' &&
          Number.isFinite(resolved.visual.nodeScale) &&
          resolved.visual.nodeScale > 0
            ? resolved.visual.nodeScale
            : 1,
      }
    : undefined

  return {
    graphMap: resolved ? readGraphMap(resolved.graphMap) : undefined,
    mapVisual: visual,
    mapImageUrl: resolved?.imageUrl ?? null,
  }
}
