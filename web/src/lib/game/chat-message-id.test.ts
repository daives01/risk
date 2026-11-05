import { describe, expect, test } from 'bun:test'
import { isPendingChatMessageId } from './chat-message-id'

describe('isPendingChatMessageId', () => {
  test('blocks local optimistic IDs but allows confirmed message IDs', () => {
    const pending = 'optimistic:all:1:hello'
    const confirmed = 'jd7d3e6qm7d9aj3zxzmdjwz1s17s9fbr'
    expect(isPendingChatMessageId(pending)).toBe(true)
    expect(isPendingChatMessageId(confirmed)).toBe(false)
  })
})
