import type { DiceRollCounts, Phase } from "risk-engine";

export type PublicState = {
  players: Record<string, { status: string; teamId?: string }>;
  turnOrder: string[];
  territories: Record<string, { ownerId: string; armies: number }>;
  turn: { currentPlayerId: string; phase: Phase; round: number };
  pending?: {
    type: "Occupy";
    from: string;
    to: string;
    minMove: number;
    maxMove: number;
  };
  reinforcements?: { remaining: number; sources?: Record<string, number> };
  capturedThisTurn: boolean;
  tradesCompleted: number;
  fortifiesUsedThisTurn?: number;
  deckCount: number;
  discardCount: number;
  handSizes: Record<string, number>;
  stateVersion: number;
};

export type HandCard = { cardId: string; kind: string; territoryId?: string };

export type PlayerRef = {
  userId?: string;
  displayName: string;
  color?: string | null;
  role?: string;
  enginePlayerId: string | null;
  teamId?: string | null;
  allowTeammatesToAct?: boolean;
  diceRollCounts?: DiceRollCounts | null;
};

export type MapVisual = {
  imageStorageId: string;
  imageWidth: number;
  imageHeight: number;
  nodeScale?: number | null;
  territoryAnchors: Record<string, { x: number; y: number }>;
};

export type GameAction = {
  _id: string;
  index: number;
  events: Array<{ type: string; [key: string]: unknown }>;
  publicStatePatch?: TimelineStatePatch;
};

export type ReinforcementDraft = { territoryId: string; count: number };

export type ChatChannel = "all" | "team" | "dm";

export type ChatMessage = {
  _id: string;
  channel: ChatChannel;
  teamId: string | null;
  recipientUserId: string | null;
  recipientDisplayName: string | null;
  recipientEnginePlayerId: string | null;
  text: string;
  createdAt: number;
  editedAt: number | null;
  senderUserId: string;
  senderDisplayName: string;
  senderEnginePlayerId: string | null;
  isMine: boolean;
};

export type HistoryFrame = {
  index: number;
  events?: Array<{ type: string; [key: string]: unknown }>;
  state: PublicState;
};

export type TimelineStatePatch = {
  players?: PublicState["players"];
  turnOrder?: PublicState["turnOrder"];
  territories?: Record<string, { ownerId?: string; armies?: number }>;
  turn?: PublicState["turn"];
  pending?: PublicState["pending"] | null;
  reinforcements?: PublicState["reinforcements"] | null;
  capturedThisTurn?: boolean;
  tradesCompleted?: number;
  fortifiesUsedThisTurn?: number | null;
  deckCount?: number;
  discardCount?: number;
  handSizes?: PublicState["handSizes"];
  stateVersion?: number;
};

export type HistoryWindow = {
  latestIndex: number;
  snapshotIndex: number | null;
  snapshotPublicState: PublicState | null;
  actions: GameAction[];
  hasPrevious: boolean;
};

export const PHASE_COPY: Record<Phase, { title: string; description: string }> = {
  Setup: {
    title: "Setting Up",
    description: "Assign territories and prepare your opening position.",
  },
  Reinforcement: {
    title: "Place",
    description: "Set a placement count, click territories to queue placements, then confirm.",
  },
  Attack: {
    title: "Attack",
    description: "Choose source and target territories to resolve battles.",
  },
  Occupy: {
    title: "Occupy",
    description: "Move armies into your newly captured territory.",
  },
  Fortify: {
    title: "Fortify",
    description: "Move armies between your territories, then end turn.",
  },
  GameOver: {
    title: "Game Over",
    description: "The match is complete.",
  },
};
