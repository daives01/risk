import { useMemo, useState, useCallback } from "react";
import type { TerritoryId, Action } from "risk-engine";

export interface PublicGameState {
  players: Record<string, { status: string; teamId?: string }>;
  turnOrder: string[];
  territories: Record<string, { ownerId: string; armies: number }>;
  turn: { currentPlayerId: string; phase: string; round: number };
  pending?: { type: "Occupy"; from: string; to: string; minMove: number; maxMove: number };
  reinforcements?: { remaining: number; sources?: Record<string, number> };
  capturedThisTurn: boolean;
  tradesCompleted: number;
  deckCount: number;
  discardCount: number;
  handSizes: Record<string, number>;
  stateVersion: number;
}

export interface MyCard {
  cardId: string;
  kind: string;
  territoryId?: string;
}

interface GameControllerParams {
  state: PublicGameState | null;
  myEnginePlayerId: string | null;
  myHand: MyCard[] | null;
  perspective: "player" | "spectator";
  adjacency: Record<string, readonly TerritoryId[]>;
}

export interface TerritoryHint {
  selectable: boolean;
  highlighted: boolean;
  role: "source" | "target" | "placeable" | "none";
}

export function useGameController({
  state,
  myEnginePlayerId,
  myHand: _myHand,
  perspective,
  adjacency,
}: GameControllerParams) {
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);
  const [selectedTo, setSelectedTo] = useState<string | null>(null);
  const [draftCount, setDraftCount] = useState(1);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const isMyTurn = state?.turn.currentPlayerId === myEnginePlayerId && perspective === "player";
  const phase = state?.turn.phase ?? "GameOver";

  const turnKey = `${state?.turn.currentPlayerId}-${phase}-${state?.stateVersion}`;

  const hints = useMemo(() => {
    const result: Record<string, TerritoryHint> = {};
    if (!state) return result;

    const territories = state.territories;
    for (const tid of Object.keys(territories)) {
      result[tid] = { selectable: false, highlighted: false, role: "none" };
    }

    if (!isMyTurn) return result;

    switch (phase) {
      case "Reinforcement": {
        const remaining = state.reinforcements?.remaining ?? 0;
        if (remaining > 0) {
          for (const [tid, t] of Object.entries(territories)) {
            if (t.ownerId === myEnginePlayerId) {
              result[tid] = { selectable: true, highlighted: true, role: "placeable" };
            }
          }
        }
        break;
      }
      case "Attack": {
        for (const [tid, t] of Object.entries(territories)) {
          if (t.ownerId === myEnginePlayerId && t.armies >= 2) {
            result[tid] = { selectable: true, highlighted: true, role: "source" };
          }
        }
        if (selectedFrom && territories[selectedFrom]?.ownerId === myEnginePlayerId) {
          const neighbors = adjacency[selectedFrom as TerritoryId] ?? [];
          for (const nid of neighbors) {
            const neighbor = territories[nid];
            if (neighbor && neighbor.ownerId !== myEnginePlayerId && neighbor.ownerId !== undefined) {
              result[nid] = { selectable: true, highlighted: true, role: "target" };
            }
          }
        }
        break;
      }
      case "Occupy": {
        break;
      }
      case "Fortify": {
        for (const [tid, t] of Object.entries(territories)) {
          if (t.ownerId === myEnginePlayerId && t.armies >= 2) {
            result[tid] = { selectable: true, highlighted: true, role: "source" };
          }
        }
        if (selectedFrom && territories[selectedFrom]?.ownerId === myEnginePlayerId) {
          const neighbors = adjacency[selectedFrom as TerritoryId] ?? [];
          for (const nid of neighbors) {
            const neighbor = territories[nid];
            if (neighbor && neighbor.ownerId === myEnginePlayerId && nid !== selectedFrom) {
              result[nid] = { selectable: true, highlighted: true, role: "target" };
            }
          }
        }
        break;
      }
    }

    return result;
  }, [state, isMyTurn, phase, myEnginePlayerId, selectedFrom, adjacency]);

  const handleTerritoryClick = useCallback((tid: string) => {
    if (!isMyTurn || !state) return;

    const hint = hints[tid];
    if (!hint?.selectable) return;

    switch (phase) {
      case "Reinforcement":
        setSelectedFrom(tid);
        setDraftCount(state.reinforcements?.remaining ?? 1);
        break;
      case "Attack":
        if (hint.role === "source") {
          setSelectedFrom(tid);
          setSelectedTo(null);
        } else if (hint.role === "target" && selectedFrom) {
          setSelectedTo(tid);
        }
        break;
      case "Fortify":
        if (hint.role === "source") {
          setSelectedFrom(tid);
          setSelectedTo(null);
          setDraftCount(1);
        } else if (hint.role === "target" && selectedFrom) {
          setSelectedTo(tid);
          const fromArmies = state.territories[selectedFrom]?.armies ?? 2;
          setDraftCount(Math.max(1, fromArmies - 1));
        }
        break;
    }
  }, [isMyTurn, state, phase, hints, selectedFrom]);

  const buildAction = useCallback((): Action | null => {
    if (!state || !isMyTurn) return null;

    switch (phase) {
      case "Reinforcement":
        if (selectedFrom && draftCount > 0) {
          return { type: "PlaceReinforcements", territoryId: selectedFrom as TerritoryId, count: draftCount };
        }
        return null;
      case "Attack":
        if (selectedFrom && selectedTo) {
          return { type: "Attack", from: selectedFrom as TerritoryId, to: selectedTo as TerritoryId };
        }
        return null;
      case "Occupy":
        if (state.pending) {
          return { type: "Occupy", moveArmies: draftCount };
        }
        return null;
      case "Fortify":
        if (selectedFrom && selectedTo && draftCount > 0) {
          return { type: "Fortify", from: selectedFrom as TerritoryId, to: selectedTo as TerritoryId, count: draftCount };
        }
        return null;
      default:
        return null;
    }
  }, [state, isMyTurn, phase, selectedFrom, selectedTo, draftCount]);

  const resetSelection = useCallback(() => {
    setSelectedFrom(null);
    setSelectedTo(null);
    setDraftCount(1);
    setSelectedCardIds([]);
  }, []);

  const toggleCardSelection = useCallback((cardId: string) => {
    setSelectedCardIds(prev =>
      prev.includes(cardId)
        ? prev.filter(id => id !== cardId)
        : prev.length < 3 ? [...prev, cardId] : prev
    );
  }, []);

  return {
    selectedFrom,
    selectedTo,
    draftCount,
    selectedCardIds,
    submitting,
    isMyTurn,
    phase,
    turnKey,
    hints,
    handleTerritoryClick,
    buildAction,
    resetSelection,
    setDraftCount,
    setSubmitting,
    toggleCardSelection,
    setSelectedFrom,
    setSelectedTo,
  };
}
