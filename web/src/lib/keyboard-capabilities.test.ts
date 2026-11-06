import { describe, expect, test } from 'bun:test'
import { blurFocusedElement, browserPlatform } from './keyboard-shortcuts'

describe('browser platform capability', () => {
  test('uses the advertised platform only when it is a string', () => {
    expect(browserPlatform({ platform: 'fallback', userAgentData: { platform: 'macOS' } })).toBe(
      'macOS',
    )

    for (const userAgentData of [undefined, null, 1, 'macOS', {}, { platform: 123 }]) {
      expect(browserPlatform({ platform: 'fallback', userAgentData })).toBe('fallback')
    }
  })
})

test('blur tolerates absent focus', () => {
  expect(() => blurFocusedElement(null)).not.toThrow()
})

test('blur preserves the receiver and supports any focused element with a callable blur', () => {
  const received: unknown[] = []

  const focusedElement = {
    blur() {
      received.push(this)
    },
  }

  blurFocusedElement(focusedElement)
  expect(received).toEqual([focusedElement])
  expect(() => blurFocusedElement({})).not.toThrow()
  expect(() => blurFocusedElement({ blur: 'not callable' })).not.toThrow()
})
