/** Optimistic query entries have local sentinel IDs until Convex confirms the send. */
export function isPendingChatMessageId(messageId: string): boolean {
  return messageId.startsWith('optimistic:')
}
