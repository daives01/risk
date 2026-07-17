export interface CombatLuckRoleStats {
  battles: number;
  expectedOwnLosses: number;
  actualOwnLosses: number;
  expectedEnemyLosses: number;
  actualEnemyLosses: number;
}

export interface CombatLuckStats {
  attack: CombatLuckRoleStats;
  defense: CombatLuckRoleStats;
}

export interface ExpectedCombatOutcome {
  attackerLosses: number;
  defenderLosses: number;
}

function emptyRoleStats(): CombatLuckRoleStats {
  return { battles: 0, expectedOwnLosses: 0, actualOwnLosses: 0, expectedEnemyLosses: 0, actualEnemyLosses: 0 };
}

export function createEmptyCombatLuckStats(): CombatLuckStats {
  return { attack: emptyRoleStats(), defense: emptyRoleStats() };
}

const outcomeCache = new Map<string, ExpectedCombatOutcome>();

/** Exact expectation under sorted six-sided dice, with ties awarded to the defender. */
export function expectedCombatOutcome(attackerDice: number, defenderDice: number): ExpectedCombatOutcome {
  if (!Number.isInteger(attackerDice) || attackerDice < 1 || !Number.isInteger(defenderDice) || defenderDice < 1) {
    throw new Error("Combat dice counts must be positive integers");
  }
  const key = `${attackerDice}:${defenderDice}`;
  const cached = outcomeCache.get(key);
  if (cached) return cached;

  let outcomes = 0;
  let attackerLosses = 0;
  let defenderLosses = 0;
  const attackRolls = new Array<number>(attackerDice);
  const defendRolls = new Array<number>(defenderDice);
  const enumerate = (rolls: number[], index: number, complete: () => void) => {
    if (index === rolls.length) return complete();
    for (let face = 1; face <= 6; face++) {
      rolls[index] = face;
      enumerate(rolls, index + 1, complete);
    }
  };
  enumerate(attackRolls, 0, () => enumerate(defendRolls, 0, () => {
    outcomes++;
    const attack = [...attackRolls].sort((a, b) => b - a);
    const defense = [...defendRolls].sort((a, b) => b - a);
    for (let index = 0; index < Math.min(attackerDice, defenderDice); index++) {
      if (attack[index]! > defense[index]!) defenderLosses++;
      else attackerLosses++;
    }
  }));
  const result = { attackerLosses: attackerLosses / outcomes, defenderLosses: defenderLosses / outcomes };
  outcomeCache.set(key, result);
  return result;
}

export function addCombatOutcome(
  stats: CombatLuckStats,
  role: "attack" | "defense",
  outcome: ExpectedCombatOutcome,
  actualAttackerLosses: number,
  actualDefenderLosses: number,
): CombatLuckStats {
  const current = stats[role];
  const attacking = role === "attack";
  return {
    ...stats,
    [role]: {
      battles: current.battles + 1,
      expectedOwnLosses: current.expectedOwnLosses + (attacking ? outcome.attackerLosses : outcome.defenderLosses),
      actualOwnLosses: current.actualOwnLosses + (attacking ? actualAttackerLosses : actualDefenderLosses),
      expectedEnemyLosses: current.expectedEnemyLosses + (attacking ? outcome.defenderLosses : outcome.attackerLosses),
      actualEnemyLosses: current.actualEnemyLosses + (attacking ? actualDefenderLosses : actualAttackerLosses),
    },
  };
}

export function combineCombatLuckStats(left: CombatLuckStats, right: CombatLuckStats): CombatLuckStats {
  const combineRole = (role: "attack" | "defense"): CombatLuckRoleStats => ({
    battles: left[role].battles + right[role].battles,
    expectedOwnLosses: left[role].expectedOwnLosses + right[role].expectedOwnLosses,
    actualOwnLosses: left[role].actualOwnLosses + right[role].actualOwnLosses,
    expectedEnemyLosses: left[role].expectedEnemyLosses + right[role].expectedEnemyLosses,
    actualEnemyLosses: left[role].actualEnemyLosses + right[role].actualEnemyLosses,
  });
  return { attack: combineRole("attack"), defense: combineRole("defense") };
}

export function combatLuckScore(stats: CombatLuckStats | CombatLuckRoleStats): number {
  if ("attack" in stats) return combatLuckScore(stats.attack) + combatLuckScore(stats.defense);
  return (stats.actualEnemyLosses - stats.expectedEnemyLosses) + (stats.expectedOwnLosses - stats.actualOwnLosses);
}
