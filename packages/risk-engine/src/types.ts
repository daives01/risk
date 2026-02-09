// ── Primitive ID types (branded strings for type safety) ──────────────

export type PlayerId = string & { readonly __brand: "PlayerId" };
export type TerritoryId = string & { readonly __brand: "TerritoryId" };
export type ContinentId = string & { readonly __brand: "ContinentId" };
export type CardId = string & { readonly __brand: "CardId" };
export type TeamId = string & { readonly __brand: "TeamId" };

// ── Enums ────────────────────────────────────────────────────────────

export type Phase =
  | "Setup"
  | "Reinforcement"
  | "Attack"
  | "Occupy"
  | "Fortify"
  | "GameOver";

export type PlayerStatus = "alive" | "defeated";

export type CardKind = "A" | "B" | "C" | "W";

// ── Actions (player → engine) ────────────────────────────────────────

export type Action =
  | TradeCards
  | PlaceReinforcements
  | AttackAction
  | OccupyAction
  | Fortify
  | EndAttackPhase
  | EndTurn;

export interface TradeCards {
  readonly type: "TradeCards";
  readonly cardIds: readonly CardId[];
}

export interface PlaceReinforcements {
  readonly type: "PlaceReinforcements";
  readonly territoryId: TerritoryId;
  readonly count: number;
}

export interface AttackAction {
  readonly type: "Attack";
  readonly from: TerritoryId;
  readonly to: TerritoryId;
  readonly attackerDice?: number;
}

export interface OccupyAction {
  readonly type: "Occupy";
  readonly moveArmies: number;
}

export interface Fortify {
  readonly type: "Fortify";
  readonly from: TerritoryId;
  readonly to: TerritoryId;
  readonly count: number;
}

export interface EndAttackPhase {
  readonly type: "EndAttackPhase";
}

export interface EndTurn {
  readonly type: "EndTurn";
}

// ── Events (engine → consumer) ───────────────────────────────────────

export type GameEvent =
  | SetupCompleted
  | ReinforcementsGranted
  | CardsTraded
  | ReinforcementsPlaced
  | AttackResolved
  | TerritoryCaptured
  | PlayerEliminated
  | OccupyResolved
  | FortifyResolved
  | CardDrawn
  | TurnEnded
  | TurnAdvanced
  | GameEnded;

export interface SetupCompleted {
  readonly type: "SetupCompleted";
  readonly turnOrder: readonly PlayerId[];
  readonly neutralTerritories: readonly TerritoryId[];
  readonly assignmentsSummary: Record<string, readonly TerritoryId[]>;
}

export interface ReinforcementsGranted {
  readonly type: "ReinforcementsGranted";
  readonly playerId: PlayerId;
  readonly amount: number;
  readonly sources: Record<string, number>;
}

export interface CardsTraded {
  readonly type: "CardsTraded";
  readonly playerId: PlayerId;
  readonly cardIds: readonly CardId[];
  readonly value: number;
  readonly tradesCompletedAfter: number;
}

export interface ReinforcementsPlaced {
  readonly type: "ReinforcementsPlaced";
  readonly playerId: PlayerId;
  readonly territoryId: TerritoryId;
  readonly count: number;
}

export interface AttackResolved {
  readonly type: "AttackResolved";
  readonly from: TerritoryId;
  readonly to: TerritoryId;
  readonly attackDice: number;
  readonly defendDice: number;
  readonly attackRolls: readonly number[];
  readonly defendRolls: readonly number[];
  readonly attackerLosses: number;
  readonly defenderLosses: number;
}

export interface TerritoryCaptured {
  readonly type: "TerritoryCaptured";
  readonly from: TerritoryId;
  readonly to: TerritoryId;
  readonly newOwnerId: PlayerId;
}

export interface PlayerEliminated {
  readonly type: "PlayerEliminated";
  readonly eliminatedId: PlayerId;
  readonly byId: PlayerId;
  readonly cardsTransferred: readonly CardId[];
}

export interface OccupyResolved {
  readonly type: "OccupyResolved";
  readonly playerId: PlayerId;
  readonly from: TerritoryId;
  readonly to: TerritoryId;
  readonly moved: number;
}

export interface FortifyResolved {
  readonly type: "FortifyResolved";
  readonly playerId: PlayerId;
  readonly from: TerritoryId;
  readonly to: TerritoryId;
  readonly moved: number;
}

export interface CardDrawn {
  readonly type: "CardDrawn";
  readonly playerId: PlayerId;
  readonly cardId: CardId;
}

export interface TurnEnded {
  readonly type: "TurnEnded";
  readonly playerId: PlayerId;
}

export interface TurnAdvanced {
  readonly type: "TurnAdvanced";
  readonly nextPlayerId: PlayerId;
  readonly round: number;
}

export interface GameEnded {
  readonly type: "GameEnded";
  readonly winningPlayerId?: PlayerId;
  readonly winningTeamId?: TeamId;
}

// ── Minimal GameState ────────────────────────────────────────────────

export interface TerritoryState {
  readonly ownerId: PlayerId | "neutral";
  readonly armies: number;
}

export interface PlayerState {
  readonly status: PlayerStatus;
  readonly teamId?: TeamId;
}

export interface PendingOccupy {
  readonly type: "Occupy";
  readonly from: TerritoryId;
  readonly to: TerritoryId;
  readonly minMove: number;
  readonly maxMove: number;
}

export interface ReinforcementState {
  readonly remaining: number;
  readonly sources?: Record<string, number>;
}

export interface CardState {
  readonly kind: CardKind;
  readonly territoryId?: TerritoryId;
}

export interface DeckState {
  readonly draw: readonly CardId[];
  readonly discard: readonly CardId[];
}

export interface RngState {
  readonly seed: string | number;
  readonly index: number;
}

export interface TurnState {
  readonly currentPlayerId: PlayerId;
  readonly phase: Phase;
  readonly round: number;
}

export interface GameState {
  readonly players: Record<string, PlayerState>;
  readonly turnOrder: readonly PlayerId[];
  readonly territories: Record<string, TerritoryState>;
  readonly turn: TurnState;
  readonly pending?: PendingOccupy;
  readonly reinforcements?: ReinforcementState;
  readonly deck: DeckState;
  readonly cardsById: Record<string, CardState>;
  readonly hands: Record<string, readonly CardId[]>;
  readonly tradesCompleted: number;
  readonly capturedThisTurn: boolean;
  readonly fortifiesUsedThisTurn?: number;
  readonly rng: RngState;
  readonly stateVersion: number;
  readonly rulesetVersion: number;
}
