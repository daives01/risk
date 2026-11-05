import type { Phase } from 'risk-engine'

import type { FunctionReturnType } from 'convex/server'
import type { api } from '@backend/_generated/api'

type PlayerView = NonNullable<FunctionReturnType<typeof api.games.getGameViewAsPlayer>>

type MapDoc = NonNullable<FunctionReturnType<typeof api.maps.getByMapId>>

type HistoryWindowResult = FunctionReturnType<typeof api.gameplay.getHistoryWindow>

export type PublicState = NonNullable<PlayerView['state']>

export type HandCard = NonNullable<PlayerView['myHand']>[number]

export type PlayerRef = PlayerView['players'][number]

export type MapVisual = MapDoc['visual']

type HistoryAction = HistoryWindowResult['actions'][number]

export type GameAction = Pick<HistoryAction, 'index' | 'events'> & { _id: string } & Partial<
    Pick<HistoryAction, 'publicStatePatch'>
  >

export type ReinforcementDraft = { territoryId: string; count: number }

export type ChatChannel = 'all' | 'team' | 'dm'

export type ChatMessage = FunctionReturnType<typeof api.gameChat.listVisibleMessages>[number]

export type HistoryFrame = {
  index: number
  events?: GameAction['events']
  state: PublicState
}

export type TimelineStatePatch = NonNullable<GameAction['publicStatePatch']>

export type HistoryWindow = Omit<HistoryWindowResult, 'actions'> & { actions: GameAction[] }

export const PHASE_COPY: Record<Phase, { title: string; description: string }> = {
  Setup: {
    title: 'Setting Up',
    description: 'Assign territories and prepare your opening position.',
  },
  Reinforcement: {
    title: 'Place',
    description: 'Set a placement count, click territories to queue placements, then confirm.',
  },
  Attack: {
    title: 'Attack',
    description: 'Choose source and target territories to resolve battles.',
  },
  Occupy: {
    title: 'Occupy',
    description: 'Move armies into your newly captured territory.',
  },
  Fortify: {
    title: 'Fortify',
    description: 'Move armies between your territories, then end turn.',
  },
  GameOver: {
    title: 'Game Over',
    description: 'The match is complete.',
  },
}
