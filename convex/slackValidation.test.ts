import { expect, test } from 'bun:test'
import {
  buildWorkspaceUpdatePatch,
  normalizeChannelId,
  normalizeSlackUserId,
  normalizeTeamId,
} from './slackValidation'

test('normalizes valid slack IDs', () => {
  expect(normalizeTeamId(' t123abc ')).toBe('T123ABC')
  expect(normalizeChannelId(' c09xyz ')).toBe('C09XYZ')
  expect(normalizeSlackUserId(' u44abc ')).toBe('U44ABC')
})

test('rejects invalid slack IDs', () => {
  expect(() => normalizeTeamId('ABC')).toThrow('Invalid Slack workspace ID')
  expect(() => normalizeChannelId('U123')).toThrow('Invalid Slack channel ID')
  expect(() => normalizeSlackUserId('C123')).toThrow('Invalid Slack user ID')
})

test('workspace updates omit absent and empty fields rather than clearing existing values', () => {
  for (const args of [{}, { teamName: '', defaultChannelId: '', status: undefined }]) {
    const patch = buildWorkspaceUpdatePatch(args)
    expect(Object.prototype.hasOwnProperty.call(patch, 'teamName')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(patch, 'defaultChannelId')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(patch, 'status')).toBe(false)
    expect(patch.updatedAt).toEqual(expect.any(Number))
  }
})

test('workspace updates preserve raw name truthiness before trimming and normalize channel IDs', () => {
  const args = { teamName: '   ', defaultChannelId: ' c123abc ' }
  const before = { ...args }
  const patch = buildWorkspaceUpdatePatch(args)
  expect(patch.teamName).toBe('')
  expect(Object.prototype.hasOwnProperty.call(patch, 'teamName')).toBe(true)
  expect(patch.defaultChannelId).toBe('C123ABC')
  expect(args).toEqual(before)
  expect(buildWorkspaceUpdatePatch({ teamName: ' Team ', status: 'disabled' })).toMatchObject({
    teamName: 'Team',
    status: 'disabled',
  })
  expect(() => buildWorkspaceUpdatePatch({ defaultChannelId: '   ' })).toThrow(
    'Invalid Slack channel ID',
  )
})
