const CARD_INCREMENT_PRESETS = [
  {
    label: "Classic (4,6,8,10,12,15 then +5)",
    tradeValues: [4, 6, 8, 10, 12, 15],
    tradeValueOverflow: "continueByFive" as const,
  },
  {
    label: "Flat (5 every trade)",
    tradeValues: [5],
    tradeValueOverflow: "repeatLast" as const,
  },
  {
    label: "Fast (6,8,10,12,15,20 then +5)",
    tradeValues: [6, 8, 10, 12, 15, 20],
    tradeValueOverflow: "continueByFive" as const,
  },
] as const;

export function formatCardIncrementLabel(
  tradeValues: number[],
  tradeValueOverflow: "repeatLast" | "continueByFive",
) {
  const preset = CARD_INCREMENT_PRESETS.find((candidate) => (
    candidate.tradeValueOverflow === tradeValueOverflow &&
    candidate.tradeValues.length === tradeValues.length &&
    candidate.tradeValues.every((value, index) => value === tradeValues[index])
  ));
  if (preset) return preset.label;
  if (tradeValues.length === 0) return "None";
  return tradeValueOverflow === "continueByFive"
    ? `${tradeValues.join(", ")} then +5`
    : `${tradeValues.join(", ")} repeat`;
}
