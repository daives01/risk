import type {
  CardId,
  CardState,
  DeckState,
  TerritoryId,
} from "./types.js";
import type { DeckDefinitionConfig } from "./config.js";
import type { Rng } from "./rng.js";

// ── Deck creation ────────────────────────────────────────────────────

export interface DeckCreationResult {
  readonly deck: DeckState;
  readonly cardsById: Record<string, CardState>;
}

/**
 * Create a shuffled deck from config and territory list.
 *
 * Territory-linked mode: cycles through kinds for each territory, then appends wilds.
 * Non-territory-linked mode: generates cards by cycling kinds to match territory count, then appends wilds.
 */
export function createDeck(
  config: DeckDefinitionConfig,
  territories: readonly TerritoryId[],
  rng: Rng,
): DeckCreationResult {
  const cardsById: Record<string, CardState> = {};
  const cardIds: CardId[] = [];

  // Generate one card per territory, cycling through kinds
  for (let i = 0; i < territories.length; i++) {
    const kind = config.kinds[i % config.kinds.length]!;
    const id = `card_${i}` as CardId;
    cardIds.push(id);
    cardsById[id] = config.territoryLinked
      ? { kind, territoryId: territories[i] }
      : { kind };
  }

  // Append wild cards
  for (let i = 0; i < config.wildCount; i++) {
    const id = `card_w${i}` as CardId;
    cardIds.push(id);
    cardsById[id] = { kind: "W" };
  }

  // Shuffle deterministically
  const shuffled = rng.shuffle(cardIds);

  return {
    deck: { draw: shuffled, discard: [] },
    cardsById,
  };
}

// ── Card draw ────────────────────────────────────────────────────────

export interface DrawResult {
  readonly cardId: CardId;
  readonly deck: DeckState;
}

/**
 * Draw a card from the draw pile. If the draw pile is empty, reshuffle
 * the discard pile into the draw pile first (deterministic via rng).
 *
 * Returns null if both draw and discard are empty (no cards left).
 */
export function drawCard(deck: DeckState, rng: Rng): DrawResult | null {
  let draw = deck.draw;
  let discard = deck.discard;

  if (draw.length === 0) {
    if (discard.length === 0) return null;
    // Reshuffle discard into draw
    draw = rng.shuffle(discard);
    discard = [];
  }

  const cardId = draw[0]!;
  return {
    cardId,
    deck: { draw: draw.slice(1), discard },
  };
}
