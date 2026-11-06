import { betterAuth } from 'better-auth'
import { username } from 'better-auth/plugins'
import { convex, crossDomain } from '@convex-dev/better-auth/plugins'
import { createClient } from '@convex-dev/better-auth'
import { components } from './_generated/api.js'
import authConfig from './auth.config.js'
import type { DataModel } from './_generated/dataModel.js'
import type { GenericCtx } from '@convex-dev/better-auth'
import { createAuthEmailHandlers } from './authEmails.js'

const env = globalThis.process?.env ?? {}

const DEFAULT_WEB_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

function parseOrigins(value: string | undefined) {
  if (!value) return []

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
}

const siteUrl = env.CONVEX_SITE_URL ?? env.SITE_URL ?? 'http://localhost:3210'
const configuredWebOrigins = parseOrigins(env.SITE_URL)
const primaryWebOrigin = configuredWebOrigins[0] ?? DEFAULT_WEB_ORIGINS[0]

const trustedWebOrigins = Array.from(
  new Set(
    configuredWebOrigins.length > 0
      ? [...configuredWebOrigins, ...DEFAULT_WEB_ORIGINS]
      : DEFAULT_WEB_ORIGINS,
  ),
)

export const authComponent = createClient<DataModel>(components.betterAuth)

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const emails = createAuthEmailHandlers('runAction' in ctx ? ctx : null, primaryWebOrigin)

  return betterAuth({
    baseURL: siteUrl,
    trustedOrigins: trustedWebOrigins,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await emails.sendResetPassword(user.email, url)
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await emails.sendVerificationEmail(user.email, url)
      },
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
    },
    plugins: [crossDomain({ siteUrl: primaryWebOrigin }), username(), convex({ authConfig })],
  })
}
