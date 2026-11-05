import { describe, expect, test } from 'bun:test'
import { getFunctionName } from 'convex/server'
import { createAuthEmailHandlers, type AuthEmailSender } from './authEmails'
import { resetPasswordEmailHtml, verificationEmailHtml } from './emails'

describe('auth email action capability', () => {
  test('constructs without an action context and fails only when sending', async () => {
    const handlers = createAuthEmailHandlers(null, 'https://app.example')
    await expect(
      handlers.sendVerificationEmail('user@example.com', 'https://auth.example/verify'),
    ).rejects.toThrow('Auth email sending requires an action context')
    await expect(
      handlers.sendResetPassword('user@example.com', 'https://auth.example/reset/token'),
    ).rejects.toThrow('Auth email sending requires an action context')
    await expect(handlers.sendResetPassword('user@example.com', 'invalid')).rejects.toBeInstanceOf(
      TypeError,
    )
  })

  test('forwards verification and reset payloads through the generated action reference', async () => {
    const calls: Array<Parameters<AuthEmailSender['runAction']>[1]> = []

    const sender: AuthEmailSender = {
      async runAction(reference, args) {
        expect(this).toBe(sender)
        expect(getFunctionName(reference)).toBe('sendEmail:sendEmail')
        calls.push(args)

        return null
      },
    }

    const handlers = createAuthEmailHandlers(sender, 'https://app.example/base')
    const verificationUrl = 'https://auth.example/verify?token=a%2Fb&callbackURL=%2F'
    await handlers.sendVerificationEmail('verify@example.com', verificationUrl)
    expect(calls.pop()).toEqual({
      to: 'verify@example.com',
      subject: 'Verify your email',
      html: verificationEmailHtml(verificationUrl),
    })

    for (const [url, expectedUrl] of [
      [
        'https://auth.example/reset/token?ignored=yes',
        'https://app.example/reset-password?token=token',
      ],
      [
        'https://auth.example/reset/a%2Fb%20c',
        'https://app.example/reset-password?token=a%252Fb%2520c',
      ],
      ['https://auth.example/reset/', 'https://app.example/reset-password'],
    ]) {
      await handlers.sendResetPassword('reset@example.com', url)
      expect(calls.pop()).toEqual({
        to: 'reset@example.com',
        subject: 'Reset your password',
        html: resetPasswordEmailHtml(expectedUrl),
      })
    }

    await expect(handlers.sendResetPassword('reset@example.com', 'invalid')).rejects.toBeInstanceOf(
      TypeError,
    )
    expect(calls).toEqual([])
  })

  test('awaits action completion and propagates the original rejection', async () => {
    let resolveAction: (value: null) => void = () => {
      throw new Error('action not started')
    }

    const actionResult = new Promise<null>((resolve) => {
      resolveAction = resolve
    })

    const sender: AuthEmailSender = {
      runAction() {
        return actionResult
      },
    }

    const handlers = createAuthEmailHandlers(sender, 'https://app.example')
    let completed = false

    const pending = handlers
      .sendVerificationEmail('user@example.com', 'https://auth.example/verify')
      .then(() => {
        completed = true
      })

    await Promise.resolve()
    expect(completed).toBe(false)
    resolveAction(null)
    await pending
    expect(completed).toBe(true)

    const failure = new Error('delivery failed')

    const failingSender: AuthEmailSender = {
      async runAction() {
        throw failure
      },
    }

    const failingHandlers = createAuthEmailHandlers(failingSender, 'https://app.example')
    await expect(
      failingHandlers.sendVerificationEmail('user@example.com', 'https://auth.example/verify'),
    ).rejects.toBe(failure)
    await expect(
      failingHandlers.sendResetPassword('user@example.com', 'https://auth.example/reset/token'),
    ).rejects.toBe(failure)
  })
})
