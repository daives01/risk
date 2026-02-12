/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";

interface PendingOccupy {
  minMove: number;
  maxMove: number;
}

interface UseGameOccupyOptions {
  pending: PendingOccupy | null | undefined;
  isMyTurn: boolean;
  historyOpen: boolean;
  controlsDisabled: boolean;
  phase: string;
  submitAction: (action: { type: "Occupy"; moveArmies: number }) => Promise<void> | void;
}

export function useGameOccupy({
  pending,
  isMyTurn,
  historyOpen,
  controlsDisabled,
  phase,
  submitAction,
}: UseGameOccupyOptions) {
  const [occupyMove, setOccupyMove] = useState(1);

  useEffect(() => {
    if (!pending) return;
    setOccupyMove((prev) => Math.max(pending.minMove, Math.min(pending.maxMove, prev)));
  }, [pending]);

  useEffect(() => {
    if (
      !pending ||
      !isMyTurn ||
      historyOpen ||
      controlsDisabled ||
      phase === "GameOver" ||
      pending.minMove !== pending.maxMove
    ) {
      return;
    }
    void submitAction({ type: "Occupy", moveArmies: pending.minMove });
  }, [controlsDisabled, historyOpen, isMyTurn, pending, phase, submitAction]);

  return {
    occupyMove,
    setOccupyMove,
  };
}
