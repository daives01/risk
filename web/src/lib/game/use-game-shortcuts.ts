import { useEffect } from "react";
import type { Phase } from "risk-engine";
import { hasCommandModifier, isTypingTarget } from "@/lib/keyboard-shortcuts";

interface UseGameShortcutsOptions {
  historyOpen: boolean;
  historyAtEnd: boolean;
  historyMaxIndex: number;
  isMyTurn: boolean;
  phase: Phase;
  reinforcementDraftCount: number;
  controlsDisabled: boolean;
  hasPendingOccupy: boolean;
  onToggleHistory: () => void;
  onSetHistoryPlaying: (next: boolean | ((prev: boolean) => boolean)) => void;
  onSetHistoryFrameIndex: (next: number | ((prev: number) => number)) => void;
  onClearSelection: () => void;
  onUndoPlacement: () => void;
  onConfirmPlacements: () => void;
  onEndAttackPhase: () => void;
  onEndTurn: () => void;
}

export function useGameShortcuts({
  historyOpen,
  historyAtEnd,
  historyMaxIndex,
  isMyTurn,
  phase,
  reinforcementDraftCount,
  controlsDisabled,
  hasPendingOccupy,
  onToggleHistory,
  onSetHistoryPlaying,
  onSetHistoryFrameIndex,
  onClearSelection,
  onUndoPlacement,
  onConfirmPlacements,
  onEndAttackPhase,
  onEndTurn,
}: UseGameShortcutsOptions) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const withCommand = hasCommandModifier(event);

      if (event.key === "Escape") {
        onClearSelection();
        return;
      }

      if (!withCommand) {
        if (key === "h") {
          event.preventDefault();
          onToggleHistory();
          onSetHistoryPlaying(false);
          return;
        }

        if (historyOpen) {
          if (event.key === "[") {
            event.preventDefault();
            onSetHistoryFrameIndex((prev) => Math.max(0, prev - 1));
            return;
          }
          if (event.key === "]") {
            event.preventDefault();
            onSetHistoryFrameIndex((prev) => Math.min(historyMaxIndex, prev + 1));
            return;
          }
          if (key === "p" && !historyAtEnd) {
            event.preventDefault();
            onSetHistoryPlaying((prev) => !prev);
            return;
          }
          if (key === "r") {
            event.preventDefault();
            onSetHistoryFrameIndex(0);
            onSetHistoryPlaying(false);
            return;
          }
        }

        if (!historyOpen && isMyTurn && phase === "Reinforcement") {
          if (key === "u" && reinforcementDraftCount > 0) {
            event.preventDefault();
            onUndoPlacement();
            return;
          }
          if (key === "c" && reinforcementDraftCount > 0 && !controlsDisabled) {
            event.preventDefault();
            onConfirmPlacements();
          }
        }

        return;
      }

      if (!historyOpen && isMyTurn && event.key === "Enter") {
        if (phase === "Reinforcement" && reinforcementDraftCount > 0 && !controlsDisabled) {
          event.preventDefault();
          onConfirmPlacements();
          return;
        }
        if (phase === "Attack" && !hasPendingOccupy) {
          event.preventDefault();
          onEndAttackPhase();
          return;
        }
        if (phase === "Fortify") {
          event.preventDefault();
          onEndTurn();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    controlsDisabled,
    hasPendingOccupy,
    historyAtEnd,
    historyMaxIndex,
    historyOpen,
    isMyTurn,
    onClearSelection,
    onConfirmPlacements,
    onEndAttackPhase,
    onEndTurn,
    onSetHistoryFrameIndex,
    onSetHistoryPlaying,
    onToggleHistory,
    onUndoPlacement,
    phase,
    reinforcementDraftCount,
  ]);
}
