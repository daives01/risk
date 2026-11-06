import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { internal } from './_generated/api.js'
import { verificationEmailHtml, resetPasswordEmailHtml } from './emails.js'

export interface AuthEmailSender {
  runAction(
    reference: typeof internal.sendEmail.sendEmail,
    args: FunctionArgs<typeof internal.sendEmail.sendEmail>,
  ): Promise<FunctionReturnType<typeof internal.sendEmail.sendEmail>>
}

interface AuthEmailHandlers {
  sendResetPassword(email: string, url: string): Promise<void>
  sendVerificationEmail(email: string, url: string): Promise<void>
}

export function createAuthEmailHandlers(
  sender: AuthEmailSender | null,
  primaryWebOrigin: string,
): AuthEmailHandlers {
  return {
    async sendResetPassword(email, url) {
      const rawResetUrl = new URL(url)
      const token = rawResetUrl.pathname.split('/').pop()
      const appResetUrl = new URL('/reset-password', primaryWebOrigin)

      if (token) {
        appResetUrl.searchParams.set('token', token)
      }

      if (!sender) throw new Error('Auth email sending requires an action context')

      await sender.runAction(internal.sendEmail.sendEmail, {
        to: email,
        subject: 'Reset your password',
        html: resetPasswordEmailHtml(appResetUrl.toString()),
      })
    },
    async sendVerificationEmail(email, url) {
      if (!sender) throw new Error('Auth email sending requires an action context')

      await sender.runAction(internal.sendEmail.sendEmail, {
        to: email,
        subject: 'Verify your email',
        html: verificationEmailHtml(url),
      })
    },
  }
}
