import type { Phase } from "risk-engine";

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

export type MapVisual = {
  imageStorageId: string;
  imageWidth: number;
  imageHeight: number;
  territoryAnchors: Record<string, { x: number; y: number }>;
};

export type GameAction = {
  _id: string;
  index: number;
  events: Array<{ type: string; [key: string]: unknown }>;
};

export type ReinforcementDraft = { territoryId: string; count: number };

export type ChatChannel = "global" | "team";

export type ChatMessage = {
  _id: string;
  channel: ChatChannel;
  teamId: string | null;
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
  actionType: string;
  label: string;
  actorId: string | null;
  turnRound: number;
  turnPlayerId: string;
  turnPhase: Phase;
  hasCapture: boolean;
  eliminatedPlayerIds: string[];
  state: PublicState;
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
