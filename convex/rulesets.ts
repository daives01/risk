import { v } from "convex/values";
import { defaultRuleset } from "risk-engine";
import type { RulesetConfig, TeamsConfig } from "risk-engine";

export const rulesetOverridesValidator = v.object({
  combat: v.optional(
    v.object({
      // Deprecated host option. Accepted for backward compatibility but ignored.
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
      tradeValues: v.optional(v.array(v.number())),
      tradeValueOverflow: v.optional(v.union(v.literal("repeatLast"), v.literal("continueByFive"))),
      // Deprecated host option. Accepted for backward compatibility but ignored.
      awardCardOnCapture: v.optional(v.boolean()),
    }),
  ),
  teams: v.optional(
    v.object({
      // Deprecated host option. Accepted for backward compatibility but ignored.
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
    tradeValueOverflow: v.union(v.literal("repeatLast"), v.literal("continueByFive")),
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
    tradeValues?: number[];
    tradeValueOverflow?: "repeatLast" | "continueByFive";
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
    // Product policy: friendly fire is always enabled in team games.
    preventAttackingTeammates: false,
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

  const tradeValues = overrides.cards?.tradeValues;
  if (tradeValues !== undefined) {
    if (tradeValues.length === 0) {
      throw new Error("cards.tradeValues must contain at least one value");
    }
    for (const value of tradeValues) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error("cards.tradeValues must only contain positive integers");
      }
    }
  }

  const tradeValueOverflow = overrides.cards?.tradeValueOverflow;
  if (tradeValueOverflow !== undefined) {
    if (tradeValueOverflow !== "repeatLast" && tradeValueOverflow !== "continueByFive") {
      throw new Error("cards.tradeValueOverflow must be repeatLast or continueByFive");
    }
  }
}

export function sanitizeRulesetOverrides(overrides?: RulesetOverrides): RulesetOverrides | undefined {
  if (!overrides) return undefined;

  const cards = overrides.cards
    ? {
        ...(overrides.cards.forcedTradeHandSize !== undefined
          ? { forcedTradeHandSize: overrides.cards.forcedTradeHandSize }
          : {}),
        ...(overrides.cards.tradeValues !== undefined
          ? { tradeValues: overrides.cards.tradeValues }
          : {}),
        ...(overrides.cards.tradeValueOverflow !== undefined
          ? { tradeValueOverflow: overrides.cards.tradeValueOverflow }
          : {}),
      }
    : undefined;
  const teams = overrides.teams
    ? {
        ...(overrides.teams.allowPlaceOnTeammate !== undefined
          ? { allowPlaceOnTeammate: overrides.teams.allowPlaceOnTeammate }
          : {}),
        ...(overrides.teams.allowFortifyWithTeammate !== undefined
          ? { allowFortifyWithTeammate: overrides.teams.allowFortifyWithTeammate }
          : {}),
        ...(overrides.teams.allowFortifyThroughTeammates !== undefined
          ? { allowFortifyThroughTeammates: overrides.teams.allowFortifyThroughTeammates }
          : {}),
      }
    : undefined;
  const fortify = overrides.fortify
    ? {
        ...(overrides.fortify.fortifyMode !== undefined
          ? { fortifyMode: overrides.fortify.fortifyMode }
          : {}),
        ...(overrides.fortify.maxFortifiesPerTurn !== undefined
          ? { maxFortifiesPerTurn: overrides.fortify.maxFortifiesPerTurn }
          : {}),
      }
    : undefined;

  const sanitized = {
    ...(fortify && Object.keys(fortify).length > 0 ? { fortify } : {}),
    ...(cards && Object.keys(cards).length > 0 ? { cards } : {}),
    ...(teams && Object.keys(teams).length > 0 ? { teams } : {}),
  };

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function resolveRulesetFromOverrides(
  teamModeEnabled: boolean,
  overrides?: RulesetOverrides,
): RulesetConfig {
  const sanitized = sanitizeRulesetOverrides(overrides);
  validateRulesetOverrides(sanitized);

  return {
    ...defaultRuleset,
    combat: {
      ...defaultRuleset.combat,
      ...(sanitized?.combat ?? {}),
      allowAttackerDiceChoice: true,
    },
    fortify: {
      ...defaultRuleset.fortify,
      ...(sanitized?.fortify ?? {}),
    },
    cards: {
      ...defaultRuleset.cards,
      ...(sanitized?.cards ?? {}),
      awardCardOnCapture: true,
    },
    teams: resolveTeams(teamModeEnabled, sanitized?.teams),
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
