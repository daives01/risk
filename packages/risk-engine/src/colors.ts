export const PLAYER_COLOR_PALETTE = [
  "#ca0424",
  "#556dff",
  "#209600",
  "#ff41ff",
  "#710079",
  "#aafb00",
  "#00bec2",
  "#ffa210",
  "#593500",
  "#08008a",
  "#005d59",
  "#9a8286",
] as const;

export type PlayerColor = (typeof PLAYER_COLOR_PALETTE)[number];

export const PLAYER_COLOR_NAME_BY_HEX: Record<PlayerColor, string> = {
  "#ca0424": "Carmine",
  "#556dff": "Royal Blue",
  "#209600": "Green",
  "#ff41ff": "Magenta",
  "#710079": "Purple",
  "#aafb00": "Lime",
  "#00bec2": "Cyan",
  "#ffa210": "Orange",
  "#593500": "Brown",
  "#08008a": "Navy",
  "#005d59": "Teal",
  "#9a8286": "Taupe",
};

export const NEUTRAL_PLAYER_COLOR = "#64748b";
