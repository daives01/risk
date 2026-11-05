/// <reference types="bun" />
import { expect, test } from 'bun:test'
import {
  FORTIFY_MODE_OPTIONS,
  MAX_FORTIFY_OPTIONS,
  TIMING_MODE_OPTIONS,
  findLobbyOption,
} from './lobby-rule-options'

test('lobby rule selects accept displayed values and reject unrecognized text', () => {
  expect(findLobbyOption(FORTIFY_MODE_OPTIONS, 'adjacent')).toBe('adjacent')
  expect(findLobbyOption(FORTIFY_MODE_OPTIONS, 'connected')).toBe('connected')
  expect(findLobbyOption(TIMING_MODE_OPTIONS, 'async_3d')).toBe('async_3d')
  expect(findLobbyOption(TIMING_MODE_OPTIONS, 'realtime')).toBe('realtime')
  expect(findLobbyOption(MAX_FORTIFY_OPTIONS, 'unlimited')).toBe('unlimited')
  expect(findLobbyOption(MAX_FORTIFY_OPTIONS, '0')).toBe('0')

  for (const invalid of ['', 'constructor', '__proto__', 'async_2d', ' 1', '1.0', 'NaN', '99']) {
    expect(findLobbyOption(FORTIFY_MODE_OPTIONS, invalid)).toBeUndefined()
    expect(findLobbyOption(TIMING_MODE_OPTIONS, invalid)).toBeUndefined()
    expect(findLobbyOption(MAX_FORTIFY_OPTIONS, invalid)).toBeUndefined()
  }
})
