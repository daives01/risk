import { useEffect } from "react";
import type { Phase } from "risk-engine";
import { hasCommandModifier, isTypingTarget } from "@/lib/keyboard-shortcuts";

interface UseGameShortcutsOptions {
  historyOpen: boolean;
  historyAtEnd: boolean;
  historyMaxIndex: number;
  isMyTurn: boolean;
  phase: Phase;
  maxPlaceCount: number;
  maxAttackDice: number;
  reinforcementDraftCount: number;
  controlsDisabled: boolean;
  hasPendingOccupy: boolean;
  onToggleHistory: () => void;
  onToggleShortcutCheatSheet: () => void;
  onSetHistoryPlaying: (next: boolean | ((prev: boolean) => boolean)) => void;
  onSetHistoryFrameIndex: (next: number | ((prev: number) => number)) => void;
  onSetPlaceCount: (count: number) => void;
  onSetAttackDice: (dice: number) => void;
  onOpenCards: () => void;
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
  maxPlaceCount,
  maxAttackDice,
  reinforcementDraftCount,
  controlsDisabled,
  hasPendingOccupy,
  onToggleHistory,
  onToggleShortcutCheatSheet,
  onSetHistoryPlaying,
  onSetHistoryFrameIndex,
  onSetPlaceCount,
  onSetAttackDice,
  onOpenCards,
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
        if (key === "?") {
          event.preventDefault();
          onToggleShortcutCheatSheet();
          return;
        }

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

        if (!historyOpen && key === "c") {
          event.preventDefault();
          onOpenCards();
          return;
        }

        const numericKey = Number.parseInt(event.key, 10);
        if (!Number.isNaN(numericKey) && numericKey >= 1) {
          if (!historyOpen && isMyTurn && phase === "Reinforcement" && !controlsDisabled && maxPlaceCount > 0) {
            event.preventDefault();
            onSetPlaceCount(Math.min(numericKey, Math.max(1, maxPlaceCount)));
            return;
          }
          if (!historyOpen && isMyTurn && phase === "Attack" && !hasPendingOccupy && maxAttackDice > 0) {
            if (numericKey <= 3 && numericKey <= maxAttackDice) {
              event.preventDefault();
              onSetAttackDice(numericKey);
              return;
            }
          }
        }

        if (!historyOpen && isMyTurn && phase === "Reinforcement") {
          if (key === "u" && reinforcementDraftCount > 0) {
            event.preventDefault();
            onUndoPlacement();
            return;
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
    maxAttackDice,
    maxPlaceCount,
    onClearSelection,
    onConfirmPlacements,
    onEndAttackPhase,
    onEndTurn,
    onOpenCards,
    onSetAttackDice,
    onSetHistoryFrameIndex,
    onSetHistoryPlaying,
    onSetPlaceCount,
    onToggleShortcutCheatSheet,
    onToggleHistory,
    onUndoPlacement,
    phase,
    reinforcementDraftCount,
  ]);
}
