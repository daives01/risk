import { expect, test } from 'bun:test'
import { internal } from './_generated/api'
import { seedPreRefactorAsyncGame } from './testFixtures/preRefactorGames.test'
import { scheduleTurnReminders, rescheduleUserReminders } from './turnReminders'
import { executeGameTransition } from './gameTransition'

test('finishing a turn cancels its reminders; taking an action preserves them', async () => {
  const { t, gameId, currentPlayerId, stateVersion } = await seedPreRefactorAsyncGame()

  const jobs = await t.run(async (ctx) => {
    const start = Date.now()
    const deadline = start + 72 * 3600000
    await ctx.db.patch(gameId, { turnStartedAt: start, turnDeadlineAt: deadline })
    const jobs = await scheduleTurnReminders(ctx, gameId, currentPlayerId, start, deadline)
    await ctx.db.patch(gameId, { turnReminderJobIds: jobs })

    return jobs
  })

  expect(jobs.length).toBeGreaterThan(0)
  await t.mutation((ctx) =>
    executeGameTransition(ctx, {
      gameId,
      source: {
        type: 'user',
        playerId: currentPlayerId,
        actingUserId: 'smoke-user-alpha',
        wasDelegated: false,
      },
      intent: { type: 'action', action: { type: 'EndAttackPhase' }, expectedVersion: stateVersion },
    }),
  )
  expect(await t.run(async (ctx) => (await ctx.db.get(gameId))?.turnReminderJobIds)).toEqual(jobs)
  await t.mutation((ctx) =>
    executeGameTransition(ctx, {
      gameId,
      source: {
        type: 'user',
        playerId: currentPlayerId,
        actingUserId: 'smoke-user-alpha',
        wasDelegated: false,
      },
      intent: { type: 'action', action: { type: 'EndTurn' }, expectedVersion: stateVersion + 1 },
    }),
  )

  for (const job of jobs)
    expect(await t.run(async (ctx) => (await ctx.db.system.get(job))?.state.kind)).toBe('canceled')
})

test('opting out removes pending reminders', async () => {
  const { t, gameId, currentPlayerId } = await seedPreRefactorAsyncGame()
  await t.run(async (ctx) => {
    const start = Date.now(),
      deadline = start + 72 * 3600000

    await ctx.db.patch(gameId, { turnStartedAt: start, turnDeadlineAt: deadline })
    const jobs = await scheduleTurnReminders(ctx, gameId, currentPlayerId, start, deadline)
    await ctx.db.patch(gameId, { turnReminderJobIds: jobs })

    const player = await ctx.db
      .query('gamePlayers')
      .withIndex('by_gameId', (q) => q.eq('gameId', gameId))
      .filter((q) => q.eq(q.field('enginePlayerId'), currentPlayerId))
      .first()

    await ctx.db.insert('userSettings', {
      userId: player!.userId,
      emailTurnNotificationsEnabled: false,
      createdAt: start,
      updatedAt: start,
    })
    await rescheduleUserReminders(ctx, player!.userId)
    expect((await ctx.db.get(gameId))?.turnReminderJobIds).toEqual([])

    for (const job of jobs) expect((await ctx.db.system.get(job))?.state.kind).toBe('canceled')
  })
})

test('stale reminder emails are skipped before contacting the provider', async () => {
  const { t, gameId, currentPlayerId } = await seedPreRefactorAsyncGame()
  expect(
    await t.action(internal.asyncTurns.sendYourTurnEmail, {
      gameId,
      expectedPlayerId: currentPlayerId,
      turnStartedAt: -1,
      reminder: true,
    }),
  ).toEqual({ sent: false, reason: 'stale_turn' })
})
