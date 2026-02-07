import { v } from "convex/values";
import { defaultRuleset } from "risk-engine";
import type { RulesetConfig, TeamsConfig } from "risk-engine";

export const rulesetOverridesValidator = v.object({
  combat: v.optional(
    v.object({
      allowAttackerDiceChoice: v.optional(v.boolean()),
    }),
  ),
  fortify: v.optional(
    v.object({
      fortifyMode: v.optional(v.union(v.literal("adjacent"), v.literal("connected"))),
      maxFortifiesPerTurn: v.optional(v.number()),
    }),
  ),
  cards: v.optional(
    v.object({
      forcedTradeHandSize: v.optional(v.number()),
      awardCardOnCapture: v.optional(v.boolean()),
    }),
  ),
  teams: v.optional(
    v.object({
      preventAttackingTeammates: v.optional(v.boolean()),
      allowPlaceOnTeammate: v.optional(v.boolean()),
      allowFortifyWithTeammate: v.optional(v.boolean()),
      allowFortifyThroughTeammates: v.optional(v.boolean()),
    }),
  ),
});

export const effectiveRulesetValidator = v.object({
  setup: v.object({
    mode: v.literal("classicLikeRandomWithNeutrals"),
    neutralTerritoryCount: v.number(),
    neutralInitialArmies: v.number(),
    playerInitialArmies: v.any(),
    distribution: v.union(v.literal("roundRobin"), v.literal("random")),
  }),
  combat: v.object({
    maxAttackDice: v.number(),
    maxDefendDice: v.number(),
    defenderDiceStrategy: v.literal("alwaysMax"),
    allowAttackerDiceChoice: v.boolean(),
  }),
  fortify: v.object({
    fortifyMode: v.union(v.literal("adjacent"), v.literal("connected")),
    maxFortifiesPerTurn: v.number(),
    allowFortifyWithTeammate: v.boolean(),
    allowFortifyThroughTeammates: v.boolean(),
  }),
  cards: v.object({
    tradeValues: v.array(v.number()),
    tradeValueOverflow: v.literal("repeatLast"),
    forcedTradeHandSize: v.number(),
    tradeSets: v.object({
      allowThreeOfAKind: v.boolean(),
      allowOneOfEach: v.boolean(),
      wildActsAsAny: v.boolean(),
    }),
    territoryTradeBonus: v.object({
      enabled: v.boolean(),
      bonusArmies: v.number(),
    }),
    awardCardOnCapture: v.boolean(),
    deckDefinition: v.object({
      kinds: v.array(v.union(v.literal("A"), v.literal("B"), v.literal("C"), v.literal("W"))),
      wildCount: v.number(),
      territoryLinked: v.boolean(),
    }),
  }),
  teams: v.object({
    teamsEnabled: v.boolean(),
    preventAttackingTeammates: v.boolean(),
    allowPlaceOnTeammate: v.boolean(),
    allowFortifyWithTeammate: v.boolean(),
    allowFortifyThroughTeammates: v.boolean(),
    winCondition: v.literal("lastTeamStanding"),
    continentBonusRecipient: v.literal("majorityHolderOnTeam"),
  }),
});

export type RulesetOverrides = {
  combat?: {
    allowAttackerDiceChoice?: boolean;
  };
  fortify?: {
    fortifyMode?: "adjacent" | "connected";
    maxFortifiesPerTurn?: number;
  };
  cards?: {
    forcedTradeHandSize?: number;
    awardCardOnCapture?: boolean;
  };
  teams?: {
    preventAttackingTeammates?: boolean;
    allowPlaceOnTeammate?: boolean;
    allowFortifyWithTeammate?: boolean;
    allowFortifyThroughTeammates?: boolean;
  };
};

const MAX_FORCED_TRADE_HAND_SIZE = 12;
const MIN_FORCED_TRADE_HAND_SIZE = 3;
const MAX_FORTIFIES_PER_TURN = 10;
const MIN_FORTIFIES_PER_TURN = 0;

function resolveTeams(teamModeEnabled: boolean, overrides?: RulesetOverrides["teams"]): TeamsConfig {
  if (!teamModeEnabled) {
    return {
      ...defaultRuleset.teams,
      teamsEnabled: false,
    };
  }

  return {
    ...defaultRuleset.teams,
    teamsEnabled: true,
    preventAttackingTeammates: overrides?.preventAttackingTeammates ?? true,
    allowPlaceOnTeammate: overrides?.allowPlaceOnTeammate ?? true,
    allowFortifyWithTeammate: overrides?.allowFortifyWithTeammate ?? true,
    allowFortifyThroughTeammates: overrides?.allowFortifyThroughTeammates ?? true,
    winCondition: "lastTeamStanding",
    continentBonusRecipient: "majorityHolderOnTeam",
  };
}

export function validateRulesetOverrides(overrides?: RulesetOverrides): void {
  if (!overrides) return;

  const forcedTradeHandSize = overrides.cards?.forcedTradeHandSize;
  if (forcedTradeHandSize !== undefined) {
    if (
      !Number.isInteger(forcedTradeHandSize) ||
      forcedTradeHandSize < MIN_FORCED_TRADE_HAND_SIZE ||
      forcedTradeHandSize > MAX_FORCED_TRADE_HAND_SIZE
    ) {
      throw new Error(
        `cards.forcedTradeHandSize must be an integer between ${MIN_FORCED_TRADE_HAND_SIZE} and ${MAX_FORCED_TRADE_HAND_SIZE}`,
      );
    }
  }

  const maxFortifiesPerTurn = overrides.fortify?.maxFortifiesPerTurn;
  if (maxFortifiesPerTurn !== undefined) {
    if (
      !Number.isInteger(maxFortifiesPerTurn) ||
      maxFortifiesPerTurn < MIN_FORTIFIES_PER_TURN ||
      maxFortifiesPerTurn > MAX_FORTIFIES_PER_TURN
    ) {
      throw new Error(
        `fortify.maxFortifiesPerTurn must be an integer between ${MIN_FORTIFIES_PER_TURN} and ${MAX_FORTIFIES_PER_TURN}`,
      );
    }
  }
}

export function resolveRulesetFromOverrides(
  teamModeEnabled: boolean,
  overrides?: RulesetOverrides,
): RulesetConfig {
  validateRulesetOverrides(overrides);

  return {
    ...defaultRuleset,
    combat: {
      ...defaultRuleset.combat,
      ...(overrides?.combat ?? {}),
    },
    fortify: {
      ...defaultRuleset.fortify,
      ...(overrides?.fortify ?? {}),
    },
    cards: {
      ...defaultRuleset.cards,
      ...(overrides?.cards ?? {}),
    },
    teams: resolveTeams(teamModeEnabled, overrides?.teams),
  };
}

export function resolveEffectiveRuleset(game: {
  teamModeEnabled?: boolean;
  rulesetOverrides?: RulesetOverrides;
  effectiveRuleset?: RulesetConfig;
}): RulesetConfig {
  if (game.effectiveRuleset) {
    const effective = game.effectiveRuleset;
    return {
      ...defaultRuleset,
      ...effective,
      combat: {
        ...defaultRuleset.combat,
        ...effective.combat,
      },
      fortify: {
        ...defaultRuleset.fortify,
        ...effective.fortify,
      },
      cards: {
        ...defaultRuleset.cards,
        ...effective.cards,
      },
      teams: {
        ...resolveTeams(effective.teams.teamsEnabled, effective.teams),
        ...effective.teams,
      },
    };
  }

  return resolveRulesetFromOverrides(game.teamModeEnabled ?? false, game.rulesetOverrides);
}
