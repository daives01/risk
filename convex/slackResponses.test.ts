import { describe, expect, test } from 'bun:test'
import { readSlackAuthTestResponse, readSlackPostMessageResponse } from './slackResponses'

describe('Slack response boundaries', () => {
  test('preserves valid responses, extras, optional presence and identity', () => {
    const auth = { ok: true, team: '', team_id: 'T123', extra: { retained: true } }
    const message = { ok: true, ts: '123.456', extra: false }
    const before = structuredClone({ auth, message })
    Object.freeze(auth)
    Object.freeze(message)
    expect(readSlackAuthTestResponse(auth)).toBe(auth)
    expect(readSlackPostMessageResponse(message)).toBe(message)
    expect({ auth, message }).toEqual(before)

    for (const read of [readSlackAuthTestResponse, readSlackPostMessageResponse]) {
      const minimal = { ok: false }
      expect(read(minimal)).toBe(minimal)
      expect(Object.prototype.hasOwnProperty.call(read(minimal), 'error')).toBe(false)
      const explicit = { ok: false, error: undefined }
      expect(read(explicit)).toBe(explicit)
      expect(Object.prototype.hasOwnProperty.call(read(explicit), 'error')).toBe(true)
      expect(read({ ok: false, error: 'invalid_auth' }).error).toBe('invalid_auth')
    }
  })

  test('rejects malformed envelopes and error fields without truthiness coercion', () => {
    for (const read of [readSlackAuthTestResponse, readSlackPostMessageResponse]) {
      for (const value of [
        null,
        undefined,
        [],
        'ok',
        1,
        {},
        { ok: 1 },
        { ok: 'false' },
        { ok: true, error: null },
        { ok: false, error: 0 },
      ]) {
        expect(() => read(value)).toThrow('Invalid Slack')
      }
    }
  })

  test('checks consumed auth fields and accepts absent or explicit undefined fields', () => {
    for (const field of ['team', 'team_id']) {
      for (const value of [null, 1, false, [], {}]) {
        expect(() => readSlackAuthTestResponse({ ok: true, [field]: value })).toThrow(
          'Invalid Slack auth.test response',
        )
      }

      const explicit = { ok: true, [field]: undefined }
      expect(readSlackAuthTestResponse(explicit)).toBe(explicit)
    }
  })

  test('checks message timestamps without imposing formatting or presence requirements', () => {
    for (const ts of [null, 1, false, [], {}]) {
      expect(() => readSlackPostMessageResponse({ ok: true, ts })).toThrow(
        'Invalid Slack chat.postMessage response',
      )
    }

    for (const value of [{ ok: true }, { ok: true, ts: undefined }, { ok: true, ts: '' }]) {
      expect(readSlackPostMessageResponse(value)).toBe(value)
    }
  })
})
