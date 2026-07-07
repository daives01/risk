export const CARD_INCREMENT_PRESETS = {
  classic: {
    label: "Classic (4,6,8,10,12,15 then +5)",
    tradeValues: [4, 6, 8, 10, 12, 15],
    tradeValueOverflow: "continueByFive" as const,
  },
  flat: {
    label: "Flat (5 every trade)",
    tradeValues: [5],
    tradeValueOverflow: "repeatLast" as const,
  },
  fast: {
    label: "Fast (6,8,10,12,15,20 then +5)",
    tradeValues: [6, 8, 10, 12, 15, 20],
    tradeValueOverflow: "continueByFive" as const,
  },
  capped: {
    label: "Capped (4,6,8,10,12,15, 20, 25, then 30)",
    tradeValues: [4, 6, 8, 10, 12, 15, 20, 25, 30],
    tradeValueOverflow: "repeatLast" as const,
  },
} as const;

export type CardIncrementPresetKey = keyof typeof CARD_INCREMENT_PRESETS;
export type CardIncrementPreset = (typeof CARD_INCREMENT_PRESETS)[CardIncrementPresetKey];

export const CARD_INCREMENT_PRESET_ENTRIES = Object.entries(CARD_INCREMENT_PRESETS) as Array<
  [CardIncrementPresetKey, CardIncrementPreset]
>;

function findMatchingCardIncrementPreset(
  tradeValues: readonly number[],
  tradeValueOverflow: "repeatLast" | "continueByFive",
): CardIncrementPreset | undefined {
  return CARD_INCREMENT_PRESET_ENTRIES.find(([, preset]) => (
    preset.tradeValueOverflow === tradeValueOverflow &&
    preset.tradeValues.length === tradeValues.length &&
    preset.tradeValues.every((value, index) => value === tradeValues[index])
  ))?.[1];
}

export function resolveCardIncrementPresetKey(
  tradeValues?: readonly number[],
  tradeValueOverflow?: "repeatLast" | "continueByFive",
): CardIncrementPresetKey {
  if (!tradeValues) return "classic";
  for (const [key, preset] of CARD_INCREMENT_PRESET_ENTRIES) {
    if (preset.tradeValueOverflow !== (tradeValueOverflow ?? "continueByFive")) continue;
    if (preset.tradeValues.length !== tradeValues.length) continue;
    if (preset.tradeValues.every((value, index) => value === tradeValues[index])) {
      return key;
    }
  }
  return "classic";
}

export function formatCardIncrementLabel(
  tradeValues: readonly number[],
  tradeValueOverflow: "repeatLast" | "continueByFive",
) {
  const preset = findMatchingCardIncrementPreset(tradeValues, tradeValueOverflow);
  if (preset) return preset.label;
  if (tradeValues.length === 0) return "None";
  return tradeValueOverflow === "continueByFive"
    ? `${tradeValues.join(", ")} then +5`
    : `${tradeValues.join(", ")} repeat`;
}
