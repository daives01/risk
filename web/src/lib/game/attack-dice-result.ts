export type AttackDiceResult = {
  key: string;
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  attackRolls: number[];
  defendRolls: number[];
  attackerLosses: number;
  defenderLosses: number;
  attackerColor: string;
  defenderColor: string;
};

export function buildAttackDiceResult(
  events: readonly unknown[],
  territories: Record<string, { name?: string }>,
  key: string,
  colors: { attacker: string; defender: string },
): AttackDiceResult | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const candidate = events[index];
    if (!candidate || typeof candidate !== "object") continue;
    const event = candidate as { type?: unknown; [key: string]: unknown };
    if (event.type !== "AttackResolved") continue;
    const from = typeof event.from === "string" ? event.from : null;
    const to = typeof event.to === "string" ? event.to : null;
    const attackRolls = Array.isArray(event.attackRolls)
      ? event.attackRolls.filter((roll): roll is number => typeof roll === "number")
      : [];
    const defendRolls = Array.isArray(event.defendRolls)
      ? event.defendRolls.filter((roll): roll is number => typeof roll === "number")
      : [];
    if (!from || !to || attackRolls.length === 0 || defendRolls.length === 0) return null;
    return {
      key,
      fromId: from,
      toId: to,
      fromLabel: territories[from]?.name ?? from,
      toLabel: territories[to]?.name ?? to,
      attackRolls,
      defendRolls,
      attackerLosses: typeof event.attackerLosses === "number" ? event.attackerLosses : 0,
      defenderLosses: typeof event.defenderLosses === "number" ? event.defenderLosses : 0,
      attackerColor: colors.attacker,
      defenderColor: colors.defender,
    };
  }
  return null;
}
