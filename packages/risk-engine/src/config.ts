import type { CardKind } from "./types.js";

// ── Setup ─────────────────────────────────────────────────────────────

export interface SetupConfig {
  readonly mode: "classicLikeRandomWithNeutrals";
  readonly neutralTerritoryCount: number;
  readonly neutralInitialArmies: number;
  readonly playerInitialArmies: Record<number, number>;
  readonly distribution: "roundRobin" | "random";
}

// ── Combat ────────────────────────────────────────────────────────────

export interface CombatConfig {
  readonly maxAttackDice: number;
  readonly maxDefendDice: number;
  readonly defenderDiceStrategy: "alwaysMax";
  readonly allowAttackerDiceChoice: boolean;
}

// ── Fortify ───────────────────────────────────────────────────────────

export interface FortifyConfig {
  readonly fortifyMode: "adjacent" | "connected";
  readonly maxFortifiesPerTurn: number;
  readonly allowFortifyWithTeammate: boolean;
  readonly allowFortifyThroughTeammates: boolean;
}

// ── Cards / Trading ───────────────────────────────────────────────────

export interface TradeSetsConfig {
  readonly allowThreeOfAKind: boolean;
  readonly allowOneOfEach: boolean;
  readonly wildActsAsAny: boolean;
}

export interface TerritoryTradeBonusConfig {
  readonly enabled: boolean;
  readonly bonusArmies: number;
}

export interface DeckDefinitionConfig {
  readonly kinds: readonly CardKind[];
  readonly wildCount: number;
  readonly territoryLinked: boolean;
}

export interface CardsConfig {
  readonly tradeValues: readonly number[];
  readonly tradeValueOverflow: "repeatLast";
  readonly forcedTradeHandSize: number;
  readonly tradeSets: TradeSetsConfig;
  readonly territoryTradeBonus: TerritoryTradeBonusConfig;
  readonly awardCardOnCapture: boolean;
  readonly deckDefinition: DeckDefinitionConfig;
}

// ── Teams ─────────────────────────────────────────────────────────────

export interface TeamsConfig {
  readonly teamsEnabled: boolean;
  readonly preventAttackingTeammates: boolean;
  readonly allowPlaceOnTeammate: boolean;
  readonly allowFortifyWithTeammate: boolean;
  readonly allowFortifyThroughTeammates: boolean;
  readonly winCondition: "lastTeamStanding";
  readonly continentBonusRecipient: "majorityHolderOnTeam";
}

// ── Full Config ───────────────────────────────────────────────────────

export interface RulesetConfig {
  readonly setup: SetupConfig;
  readonly combat: CombatConfig;
  readonly fortify: FortifyConfig;
  readonly cards: CardsConfig;
  readonly teams: TeamsConfig;
}

// ── Default (classic Risk) ────────────────────────────────────────────

export const defaultRuleset: RulesetConfig = {
  setup: {
    mode: "classicLikeRandomWithNeutrals",
    neutralTerritoryCount: 2,
    neutralInitialArmies: 1,
    // Classic Risk initial armies by player count
    playerInitialArmies: {
      2: 40,
      3: 35,
      4: 30,
      5: 25,
      6: 20,
    },
    distribution: "roundRobin",
  },

  combat: {
    maxAttackDice: 3,
    maxDefendDice: 2,
    defenderDiceStrategy: "alwaysMax",
    allowAttackerDiceChoice: true,
  },

  fortify: {
    fortifyMode: "connected",
    maxFortifiesPerTurn: Number.MAX_SAFE_INTEGER,
    allowFortifyWithTeammate: false,
    allowFortifyThroughTeammates: false,
  },

  cards: {
    tradeValues: [4, 6, 8, 10, 12, 15],
    tradeValueOverflow: "repeatLast",
    forcedTradeHandSize: 5,
    tradeSets: {
      allowThreeOfAKind: true,
      allowOneOfEach: true,
      wildActsAsAny: true,
    },
    territoryTradeBonus: {
      enabled: true,
      bonusArmies: 2,
    },
    awardCardOnCapture: true,
    deckDefinition: {
      kinds: ["A", "B", "C"],
      wildCount: 2,
      territoryLinked: true,
    },
  },

  teams: {
    teamsEnabled: false,
    preventAttackingTeammates: true,
    allowPlaceOnTeammate: false,
    allowFortifyWithTeammate: false,
    allowFortifyThroughTeammates: false,
    winCondition: "lastTeamStanding",
    continentBonusRecipient: "majorityHolderOnTeam",
  },
};
