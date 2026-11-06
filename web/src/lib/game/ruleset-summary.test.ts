import { describe, expect, test } from 'bun:test'
import {
  CARD_INCREMENT_PRESET_ENTRIES,
  CARD_INCREMENT_PRESETS,
  formatCardIncrementLabel,
  resolveCardIncrementPresetKey,
} from './ruleset-summary'

describe('ruleset summary', () => {
  test('recognizes the capped card increment preset', () => {
    const tradeValues = [4, 6, 8, 10, 12, 15, 20, 25, 30]

    expect(resolveCardIncrementPresetKey(tradeValues, 'repeatLast')).toBe('capped')
    expect(formatCardIncrementLabel(tradeValues, 'repeatLast')).toBe(
      'Capped (4,6,8,10,12,15, 20, 25, then 30)',
    )
  })

  test('formats custom schedules without falling back to a preset label', () => {
    expect(formatCardIncrementLabel([4, 6, 8, 10, 12, 20], 'continueByFive')).toBe(
      '4, 6, 8, 10, 12, 20 then +5',
    )
  })
})

test('card increment choices preserve their display order and matching schedules', () => {
  expect(CARD_INCREMENT_PRESET_ENTRIES.map(([key]) => key)).toEqual([
    'classic',
    'flat',
    'fast',
    'capped',
  ])

  for (const [key, preset] of CARD_INCREMENT_PRESET_ENTRIES) {
    expect(preset).toBe(CARD_INCREMENT_PRESETS[key])
    expect(resolveCardIncrementPresetKey(preset.tradeValues, preset.tradeValueOverflow)).toBe(key)
  }
})
