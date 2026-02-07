export const PLAYER_COLOR_PALETTE = [
  "#e11d48",
  "#2563eb",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#be123c",
  "#4f46e5",
  "#0f766e",
  "#a16207",
  "#7c3aed",
] as const;

export type PlayerColor = (typeof PLAYER_COLOR_PALETTE)[number];

export const NEUTRAL_PLAYER_COLOR = "#64748b";
