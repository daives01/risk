type HistoryRecord = Record<string, unknown>

function isHistoryRecord(value: unknown): value is HistoryRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readHistoryRecord(value: unknown): HistoryRecord {
  if (!isHistoryRecord(value)) {
    throw new Error('Invalid history record')
  }

  return value
}

export function redactHistoryEvents(value: unknown): HistoryRecord[] {
  if (!Array.isArray(value)) throw new Error('Invalid history events')
  const events: HistoryRecord[] = []

  for (const entry of value) {
    const event = readHistoryRecord(entry)

    switch (event.type) {
      case 'CardDrawn':
        events.push({ type: event.type, playerId: event.playerId })
        break
      case 'CardsTraded':
        events.push({
          type: event.type,
          playerId: event.playerId,
          value: event.value,
          tradesCompletedAfter: event.tradesCompletedAfter,
        })
        break
      case 'PlayerEliminated':
        events.push({
          type: event.type,
          eliminatedId: event.eliminatedId,
          byId: event.byId,
          cardsTransferredCount: Array.isArray(event.cardsTransferred)
            ? event.cardsTransferred.length
            : 0,
        })
        break
      default:
        events.push(event)
    }
  }

  return events
}

export function redactHistoryAction(value: unknown): HistoryRecord {
  const action = readHistoryRecord(value)

  if (action.type === 'TradeCards') return { type: action.type }

  return action
}
