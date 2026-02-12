/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react";

interface PlayerLike {
  status?: string;
}

interface StateLike {
  turn: { phase: string };
  players: Record<string, PlayerLike>;
}

interface UseEndgameModalOptions {
  state: StateLike | null | undefined;
  historyOpen: boolean;
  isSpectator: boolean;
  isWinner: boolean;
  myEnginePlayerId: string | undefined;
}

export function useEndgameModal({
  state,
  historyOpen,
  isSpectator,
  isWinner,
  myEnginePlayerId,
}: UseEndgameModalOptions) {
  const [endgameModal, setEndgameModal] = useState<"won" | "lost" | null>(null);
  const dismissedEndgameRef = useRef(false);
  const isEliminated = !!myEnginePlayerId && state?.players[myEnginePlayerId]?.status === "defeated";

  useEffect(() => {
    if (historyOpen || isSpectator || !state) return;
    if (state.turn.phase !== "GameOver") return;
    if (endgameModal || dismissedEndgameRef.current) return;
    if (isWinner) {
      setEndgameModal("won");
      return;
    }
    if (isEliminated) {
      setEndgameModal("lost");
    }
  }, [endgameModal, historyOpen, isEliminated, isSpectator, isWinner, state]);

  return {
    endgameModal,
    setEndgameModal,
    dismissedEndgameRef,
    isEliminated,
  };
}
