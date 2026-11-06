import { expect, test } from 'bun:test'
import { findSelectOption } from './select-option'

test('select controls accept offered values and ignore malformed and prototype names', () => {
  const options = [{ value: 'connected' }, { value: 'adjacent' }]

  for (const option of options) expect(findSelectOption(options, option.value)).toBe(option)

  for (const value of [
    '',
    'CONNECTED',
    ' connected',
    'constructor',
    'toString',
    '__proto__',
    'dm:missing',
  ]) {
    expect(findSelectOption(options, value)).toBeUndefined()
  }
})
