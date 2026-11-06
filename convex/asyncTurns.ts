import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from './_generated/server'
import { v } from 'convex/values'
import type { GameState, GraphMap, PlayerId, RulesetConfig } from 'risk-engine'
import { internal, components } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { isAsyncTimingMode } from './gameTiming'
import { DEFAULT_TIME_ZONE } from './turnReminderTiming'
import { yourTurnEmailHtml, turnReminderEmailHtml } from './emails'
import { readGameStateNullable } from './typeAdapters'
import { getGameStateDoc } from './gameState'
import { applyTimeoutPolicy, executeGameTransition, GameTransitionRejected } from './gameTransition'

export function applyTimeoutTurnResolution(args: {
  state: GameState
  playerId: PlayerId
  graphMap: GraphMap
  ruleset: RulesetConfig
}) {
  const frames = applyTimeoutPolicy(args)

  if (!frames) return null

  return {
    nextState: frames[frames.length - 1]!.afterState,
    actionLogs: frames.map((frame) => ({
      action: frame.action,
      events: [...frame.events],
      publicStatePatch: {},
      beforeVersion: frame.beforeState.stateVersion,
      afterVersion: frame.afterState.stateVersion,
    })),
  }
}

async function processExpiredTurnForGame(
  ctx: MutationCtx,
  args: {
    gameId: Id<'games'>
    expectedPlayerId: string
    expectedTurnStartedAt: number
  },
) {
  try {
    // SAFETY: timeout arguments carry the scheduled engine ID as a string; executeGameTransition
    // rejects a stale or mismatched current player before applying any engine action.
    const expectedPlayerId = args.expectedPlayerId as PlayerId

    await executeGameTransition(ctx, {
      gameId: args.gameId,
      source: { type: 'system_timeout', playerId: expectedPlayerId },
      intent: {
        type: 'timeout',
        expectedPlayerId,
        expectedTurnStartedAt: args.expectedTurnStartedAt,
      },
    })

    return { processed: true as const }
  } catch (error) {
    if (error instanceof GameTransitionRejected) {
      const reason =
        error.reason === 'no_timeout_resolution'
          ? 'no_resolution'
          : error.reason === 'map_missing'
            ? 'map_missing'
            : error.reason === 'state_missing' || error.reason === 'game_over'
              ? 'game_over'
              : error.reason === 'timeout_player_changed'
                ? 'player_changed'
                : 'stale_or_inactive'

      return { processed: false as const, reason }
    }

    throw error
  }
}

export const processExpiredTurn = internalMutation({
  args: {
    gameId: v.id('games'),
    expectedPlayerId: v.string(),
    expectedTurnStartedAt: v.number(),
  },
  handler: async (ctx, args) => await processExpiredTurnForGame(ctx, args),
})

export const sendYourTurnEmail = internalAction({
  args: {
    gameId: v.id('games'),
    expectedPlayerId: v.string(),
    turnStartedAt: v.number(),
    reminder: v.optional(v.boolean()),
    kind: v.optional(v.union(v.literal('morning'), v.literal('final'))),
  },
  handler: async (ctx, args) => {
    const game = await ctx.runQuery(internal.asyncTurns.getGameForNotification, {
      gameId: args.gameId,
    })

    if (!game) return { sent: false, reason: 'game_not_found' }

    if (game.status !== 'active') return { sent: false, reason: 'not_active' }

    if (!isAsyncTimingMode(game.timingMode ?? 'realtime')) {
      return { sent: false, reason: 'not_async' }
    }

    if (game.turnStartedAt !== args.turnStartedAt) {
      return { sent: false, reason: 'stale_turn' }
    }

    if (args.reminder && (!game.turnDeadlineAt || game.turnDeadlineAt <= Date.now()))
      return { sent: false, reason: 'expired' }
    const state = readGameStateNullable(game.state)

    if (!state || state.turn.currentPlayerId !== args.expectedPlayerId) {
      return { sent: false, reason: 'player_mismatch' }
    }

    const targetPlayer = game.players.find(
      (player: { enginePlayerId?: string }) => player.enginePlayerId === args.expectedPlayerId,
    )

    if (!targetPlayer) return { sent: false, reason: 'target_missing' }

    const settings = await ctx.runQuery(internal.asyncTurns.getUserTurnEmailSetting, {
      userId: targetPlayer.userId,
    })

    if (!settings.emailTurnNotificationsEnabled) {
      return { sent: false, reason: 'disabled_by_user' }
    }

    const user =
      (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'user',
        where: [{ field: 'userId', operator: 'eq', value: targetPlayer.userId }],
      })) ??
      (await ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: 'user',
        where: [{ field: '_id', operator: 'eq', value: targetPlayer.userId }],
      }))

    // SAFETY: both adapter lookups select the Better Auth user model, whose schema requires
    // a string email. The SDK returns any; narrow only the consumed field and nullable row.
    const email = (user as { email?: string | null } | null)?.email?.trim()

    if (!email) return { sent: false, reason: 'email_missing' }

    const env = globalThis.process?.env ?? {}

    const siteUrl = env.SITE_URL ?? 'http://localhost:5173'
    const gameUrl = `${siteUrl}/play/${game._id}`

    const turnDeadlineLabel = game.turnDeadlineAt
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: settings.timeZone,
          dateStyle: 'full',
          timeStyle: 'short',
        }).format(game.turnDeadlineAt) + ` (${settings.timeZone})`
      : null

    const remaining = Math.max(1, Math.ceil(((game.turnDeadlineAt ?? 0) - Date.now()) / 3600000))

    const localDate = (at: number) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: settings.timeZone }).format(at)

    const reminderTitle =
      args.kind === 'final'
        ? `Your turn ends in ${remaining} ${remaining === 1 ? 'hour' : 'hours'}`
        : localDate(game.turnDeadlineAt ?? 0) === localDate(Date.now())
          ? 'Your turn expires today'
          : 'Your turn expires tomorrow'

    await ctx.runAction(internal.sendEmail.sendEmail, {
      to: email,
      subject: args.reminder ? `${reminderTitle}: ${game.name}` : `Your turn: ${game.name}`,
      html: args.reminder
        ? turnReminderEmailHtml({
            gameName: game.name,
            gameUrl,
            deadlineLabel: turnDeadlineLabel!,
            title: reminderTitle,
          })
        : yourTurnEmailHtml({
            gameName: game.name,
            gameUrl,
            turnDeadlineLabel,
          }),
    })

    return { sent: true }
  },
})

export const getGameForNotification = internalQuery({
  args: { gameId: v.id('games') },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId)

    if (!game) return null

    const players = await ctx.db
      .query('gamePlayers')
      .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
      .collect()

    const gameState = await getGameStateDoc(ctx, gameId)

    return {
      ...game,
      state: gameState?.privateState,
      players,
    }
  },
})

export const getUserTurnEmailSetting = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const settings = await ctx.db
      .query('userSettings')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique()

    return {
      timeZone: settings?.timeZone ?? DEFAULT_TIME_ZONE,
      emailTurnNotificationsEnabled: settings?.emailTurnNotificationsEnabled ?? true,
    }
  },
})
