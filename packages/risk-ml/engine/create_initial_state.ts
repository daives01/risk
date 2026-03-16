import {
  calculateReinforcements,
  createDeck,
  createRng,
  resolveInitialArmies,
  type CardId,
  type GameState,
  type GraphMap,
  type PlayerId,
  type RulesetConfig,
  type TerritoryId,
} from "risk-engine";

function distributeInitialArmiesCappedRandom(
  playerTerritoryIds: TerritoryId[],
  territories: Record<string, { ownerId: PlayerId | "neutral"; armies: number }>,
  initialArmies: number,
  cap: number,
  rng: ReturnType<typeof createRng>,
) {
  if (playerTerritoryIds.length === 0) return;

  let remaining = Math.max(0, initialArmies - playerTerritoryIds.length);
  const minCap = Math.ceil(initialArmies / playerTerritoryIds.length);
  const effectiveCap = Math.max(cap, minCap);

  const eligible = [...playerTerritoryIds];
  while (remaining > 0 && eligible.length > 0) {
    const idx = rng.nextInt(0, eligible.length - 1);
    const territoryId = eligible[idx]!;
    const territory = territories[territoryId]!;

    if (territory.armies < effectiveCap) {
      territory.armies += 1;
      remaining -= 1;
    }

    if (territory.armies >= effectiveCap) {
      eligible[idx] = eligible[eligible.length - 1]!;
      eligible.pop();
    }
  }
}

export function createInitialState(
  graphMap: GraphMap,
  ruleset: RulesetConfig,
  numPlayers: number,
  seed: string | number,
): GameState {
  if (!Number.isInteger(numPlayers) || numPlayers < 2) {
    throw new Error("numPlayers must be an integer >= 2");
  }

  const territoryIds = Object.keys(graphMap.territories) as TerritoryId[];
  if (numPlayers > territoryIds.length) {
    throw new Error("numPlayers cannot exceed territory count");
  }

  const playerIds: PlayerId[] = Array.from(
    { length: numPlayers },
    (_, idx) => `p${idx}` as PlayerId,
  );

  const rng = createRng({ seed, index: 0 });
  const turnOrder = rng.shuffle(playerIds);
  const shuffledTerritories = rng.shuffle(territoryIds);

  const neutralCount = Math.max(
    0,
    Math.min(
      ruleset.setup.neutralTerritoryCount,
      territoryIds.length - numPlayers,
    ),
  );
  const neutralTerritories = shuffledTerritories.slice(0, neutralCount);
  const playerTerritories = shuffledTerritories.slice(neutralCount);

  const territories: Record<
    string,
    { ownerId: PlayerId | "neutral"; armies: number }
  > = {};

  for (const territoryId of neutralTerritories) {
    territories[territoryId] = {
      ownerId: "neutral",
      armies: ruleset.setup.neutralInitialArmies,
    };
  }

  const byPlayer: Record<string, TerritoryId[]> = {};
  for (const playerId of turnOrder) {
    byPlayer[playerId] = [];
  }

  for (let idx = 0; idx < playerTerritories.length; idx += 1) {
    const playerId = turnOrder[idx % turnOrder.length]!;
    const territoryId = playerTerritories[idx]!;
    territories[territoryId] = { ownerId: playerId, armies: 1 };
    byPlayer[playerId]!.push(territoryId);
  }

  const initialArmies = resolveInitialArmies(
    ruleset.setup,
    playerIds.length,
    territoryIds.length,
    neutralCount,
  );

  for (const playerId of turnOrder) {
    distributeInitialArmiesCappedRandom(
      byPlayer[playerId]!,
      territories,
      initialArmies,
      4,
      rng,
    );
  }

  const players: Record<string, { status: "alive" }> = {};
  for (const playerId of playerIds) {
    players[playerId] = { status: "alive" };
  }

  const deckResult = createDeck(
    ruleset.cards.deckDefinition,
    territoryIds,
    rng,
  );

  const hands: Record<string, readonly CardId[]> = {};
  for (const playerId of playerIds) {
    hands[playerId] = [];
  }

  const firstPlayer = turnOrder[0]!;
  const reinforcementResult = calculateReinforcements(
    { territories, players } as GameState,
    firstPlayer,
    graphMap,
    ruleset.teams,
    turnOrder,
  );

  return {
    players,
    turnOrder,
    territories,
    turn: {
      currentPlayerId: firstPlayer,
      phase: "Reinforcement",
      round: 1,
    },
    reinforcements: {
      remaining: reinforcementResult.total,
      sources: reinforcementResult.sources,
    },
    deck: deckResult.deck,
    cardsById: deckResult.cardsById,
    hands,
    tradesCompleted: 0,
    capturedThisTurn: false,
    fortifiesUsedThisTurn: 0,
    rng: rng.state,
    stateVersion: 1,
    rulesetVersion: 1,
  };
}
