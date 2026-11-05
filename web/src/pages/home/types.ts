import type { FunctionReturnType } from 'convex/server'
import type { api } from '@backend/_generated/api'

export const PAGE_SIZE = 5

export type HomeTab = 'home' | 'archive' | 'account'

export type GamesFilter = 'active' | 'lobby' | 'public'

export type MyGame = FunctionReturnType<typeof api.games.listMyGames>[number]

export type PublicGame = FunctionReturnType<typeof api.games.listPublicGames>[number]

export type FilteredGame = {
  _id: string
  name: string
  status: 'active' | 'lobby' | 'public'
  isMyTurn: boolean
}

export function gameRecency(game: MyGame): number {
  return game.startedAt ?? game.finishedAt ?? game.createdAt
}

export function gameStatusLabel(status: 'active' | 'lobby' | 'public'): string {
  if (status === 'active') return 'Active'

  if (status === 'lobby') return 'Lobby'

  return 'Public'
}

export function isMyTurn(game: MyGame): boolean {
  return (
    game.status === 'active' &&
    game.myEnginePlayerId !== null &&
    game.currentTurnPlayerId !== null &&
    game.myEnginePlayerId === game.currentTurnPlayerId
  )
}
