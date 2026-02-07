export const PLAYER_COLOR_PALETTE = [
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#9333ea",
  "#0891b2",
  "#0f766e",
  "#16a34a",
  "#65a30d",
  "#eab308",
  "#a16207",
  "#ca8a04",
  "#f59e0b",
  "#ea580c",
  "#dc2626",
  "#e11d48",
  "#be123c",
] as const;

export type PlayerColor = (typeof PLAYER_COLOR_PALETTE)[number];

export const PLAYER_COLOR_NAME_BY_HEX: Record<PlayerColor, string> = {
  "#2563eb": "Blue",
  "#4f46e5": "Indigo",
  "#7c3aed": "Violet",
  "#9333ea": "Purple",
  "#0891b2": "Cyan",
  "#0f766e": "Teal",
  "#16a34a": "Green",
  "#65a30d": "Lime",
  "#eab308": "Yellow",
  "#a16207": "Brown",
  "#ca8a04": "Amber",
  "#f59e0b": "Orange",
  "#ea580c": "Burnt Orange",
  "#dc2626": "Red",
  "#e11d48": "Rose",
  "#be123c": "Crimson",
};

export const NEUTRAL_PLAYER_COLOR = "#64748b";
