/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react";

interface PendingOccupy {
  minMove: number;
  maxMove: number;
}

interface UseGameOccupyOptions {
  pending: PendingOccupy | null | undefined;
  stateVersion: number | null | undefined;
  isMyTurn: boolean;
  historyOpen: boolean;
  controlsDisabled: boolean;
  phase: string;
  submitAction: (action: { type: "Occupy"; moveArmies: number }) => Promise<void> | void;
}

export function useGameOccupy({
  pending,
  stateVersion,
  isMyTurn,
  historyOpen,
  controlsDisabled,
  phase,
  submitAction,
}: UseGameOccupyOptions) {
  const [occupyMove, setOccupyMove] = useState(1);
  const autoOccupySubmittedKeyRef = useRef<string | null>(null);

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
    const submissionKey = [
      stateVersion ?? "unknown",
      pending.minMove,
      pending.maxMove,
    ].join(":");
    if (autoOccupySubmittedKeyRef.current === submissionKey) return;
    autoOccupySubmittedKeyRef.current = submissionKey;
    void submitAction({ type: "Occupy", moveArmies: pending.minMove });
  }, [controlsDisabled, historyOpen, isMyTurn, pending, phase, stateVersion, submitAction]);

  return {
    occupyMove,
    setOccupyMove,
  };
}
