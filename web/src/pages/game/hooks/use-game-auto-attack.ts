/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import type { TerritoryId } from "risk-engine";

interface TerritoryState {
  armies: number;
}

interface StateLike {
  stateVersion: number;
  pending?: unknown;
  territories: Record<string, TerritoryState>;
}

interface UseGameAutoAttackOptions {
  state: StateLike | null | undefined;
  isMyTurn: boolean;
  historyOpen: boolean;
  phase: string;
  selectedFrom: string | null;
  selectedTo: string | null;
  submitting: boolean;
  validToIds: Set<string>;
  submitAction: (
    action: { type: "Attack"; from: TerritoryId; to: TerritoryId; attackerDice: number },
    options?: { preserveSelection?: boolean; preserveAttackDice?: boolean },
  ) => Promise<void> | void;
}

export function useGameAutoAttack({
  state,
  isMyTurn,
  historyOpen,
  phase,
  selectedFrom,
  selectedTo,
  submitting,
  validToIds,
  submitAction,
}: UseGameAutoAttackOptions) {
  const [autoAttacking, setAutoAttacking] = useState(false);
  const autoAttackSubmittedVersionRef = useRef<number | null>(null);

  const stopAutoAttack = useCallback(() => {
    autoAttackSubmittedVersionRef.current = null;
    setAutoAttacking(false);
  }, []);

  useEffect(() => {
    if (!autoAttacking) return;
    if (!state || !isMyTurn || historyOpen || phase !== "Attack" || state.pending) {
      stopAutoAttack();
      return;
    }
    if (!selectedFrom || !selectedTo || submitting) return;
    const fromArmies = state.territories[selectedFrom]?.armies ?? 0;
    if (fromArmies < 4) {
      stopAutoAttack();
      return;
    }
    if (!validToIds.has(selectedTo)) {
      stopAutoAttack();
      return;
    }
    if (autoAttackSubmittedVersionRef.current === state.stateVersion) return;
    autoAttackSubmittedVersionRef.current = state.stateVersion;
    void submitAction(
      {
        type: "Attack",
        from: selectedFrom as TerritoryId,
        to: selectedTo as TerritoryId,
        attackerDice: 3,
      },
      { preserveSelection: true, preserveAttackDice: true },
    );
  }, [
    autoAttacking,
    historyOpen,
    isMyTurn,
    phase,
    selectedFrom,
    selectedTo,
    state,
    stopAutoAttack,
    submitAction,
    submitting,
    validToIds,
  ]);

  return {
    autoAttacking,
    setAutoAttacking,
    stopAutoAttack,
    autoAttackSubmittedVersionRef,
  };
}
