export interface SlackAuthTestResponse {
  ok: boolean
  error?: string
  team?: string
  team_id?: string
}

export interface SlackPostMessageResponse {
  ok: boolean
  error?: string
  ts?: string
}

function isSlackResponse(value: unknown): value is { ok: boolean; error?: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'ok' in value &&
    typeof value.ok === 'boolean' &&
    (!('error' in value) || value.error === undefined || typeof value.error === 'string')
  )
}

export function readSlackAuthTestResponse(value: unknown): SlackAuthTestResponse {
  if (
    !isSlackResponse(value) ||
    ('team' in value && value.team !== undefined && typeof value.team !== 'string') ||
    ('team_id' in value && value.team_id !== undefined && typeof value.team_id !== 'string')
  ) {
    throw new Error('Invalid Slack auth.test response')
  }

  return value
}

export function readSlackPostMessageResponse(value: unknown): SlackPostMessageResponse {
  if (
    !isSlackResponse(value) ||
    ('ts' in value && value.ts !== undefined && typeof value.ts !== 'string')
  ) {
    throw new Error('Invalid Slack chat.postMessage response')
  }

  return value
}
