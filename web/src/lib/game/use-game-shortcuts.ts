import { useEffect } from "react";
import type { Phase } from "risk-engine";
import { hasCommandModifier, isTypingTarget } from "@/lib/keyboard-shortcuts";

interface UseGameShortcutsOptions {
  historyOpen: boolean;
  historyAtEnd: boolean;
  historyMaxIndex: number;
  isMyTurn: boolean;
  phase: Phase;
  cardsOpen: boolean;
  placeCount: number;
  attackDice: number;
  occupyMove: number;
  fortifyCount: number;
  maxPlaceCount: number;
  maxAttackDice: number;
  reinforcementDraftCount: number;
  controlsDisabled: boolean;
  hasPendingOccupy: boolean;
  canSetOccupy: boolean;
  occupyMinMove: number;
  occupyMaxMove: number;
  canSetFortify: boolean;
  maxFortifyCount: number;
  onToggleHistory: () => void;
  onToggleShortcutCheatSheet: () => void;
  onSetHistoryPlaying: (next: boolean | ((prev: boolean) => boolean)) => void;
  onSetHistoryFrameIndex: (next: number | ((prev: number) => number)) => void;
  onSetPlaceCount: (count: number) => void;
  onSetAttackDice: (dice: number) => void;
  onSetOccupyMove: (count: number) => void;
  onSetFortifyCount: (count: number) => void;
  onToggleCards: () => void;
  onCloseCards: () => void;
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
  cardsOpen,
  placeCount,
  attackDice,
  occupyMove,
  fortifyCount,
  maxPlaceCount,
  maxAttackDice,
  reinforcementDraftCount,
  controlsDisabled,
  hasPendingOccupy,
  canSetOccupy,
  occupyMinMove,
  occupyMaxMove,
  canSetFortify,
  maxFortifyCount,
  onToggleHistory,
  onToggleShortcutCheatSheet,
  onSetHistoryPlaying,
  onSetHistoryFrameIndex,
  onSetPlaceCount,
  onSetAttackDice,
  onSetOccupyMove,
  onSetFortifyCount,
  onToggleCards,
  onCloseCards,
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
        if (cardsOpen) {
          event.preventDefault();
          onCloseCards();
          return;
        }
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
          if (cardsOpen) {
            onCloseCards();
            return;
          }
          onToggleCards();
          return;
        }

        if (
          !historyOpen &&
          isMyTurn &&
          !controlsDisabled &&
          (event.key === "ArrowUp" || event.key === "ArrowDown")
        ) {
          const delta = event.key === "ArrowUp" ? 1 : -1;
          if (canSetOccupy) {
            event.preventDefault();
            const next = occupyMove + delta;
            const clamped = Math.min(Math.max(next, occupyMinMove), Math.max(occupyMinMove, occupyMaxMove));
            onSetOccupyMove(clamped);
            return;
          }
          if (canSetFortify && maxFortifyCount > 0) {
            event.preventDefault();
            const next = fortifyCount + delta;
            onSetFortifyCount(Math.min(Math.max(1, next), maxFortifyCount));
            return;
          }
          if (phase === "Reinforcement" && maxPlaceCount > 0) {
            event.preventDefault();
            const next = placeCount + delta;
            onSetPlaceCount(Math.min(Math.max(1, next), maxPlaceCount));
            return;
          }
          if (phase === "Attack" && !hasPendingOccupy && maxAttackDice > 0) {
            event.preventDefault();
            const next = attackDice + delta;
            onSetAttackDice(Math.min(Math.max(1, next), maxAttackDice));
            return;
          }
        }

        const numericKey = Number.parseInt(event.key, 10);
        if (!Number.isNaN(numericKey) && numericKey >= 1) {
          if (!historyOpen && isMyTurn && canSetOccupy && !controlsDisabled) {
            event.preventDefault();
            const clamped = Math.min(Math.max(numericKey, occupyMinMove), Math.max(occupyMinMove, occupyMaxMove));
            onSetOccupyMove(clamped);
            return;
          }
          if (!historyOpen && isMyTurn && canSetFortify && !controlsDisabled && maxFortifyCount > 0) {
            event.preventDefault();
            onSetFortifyCount(Math.min(Math.max(1, maxFortifyCount), numericKey));
            return;
          }
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
    attackDice,
    canSetFortify,
    canSetOccupy,
    controlsDisabled,
    fortifyCount,
    hasPendingOccupy,
    historyAtEnd,
    historyMaxIndex,
    historyOpen,
    isMyTurn,
    maxFortifyCount,
    maxAttackDice,
    maxPlaceCount,
    occupyMaxMove,
    occupyMinMove,
    occupyMove,
    cardsOpen,
    onClearSelection,
    onConfirmPlacements,
    onEndAttackPhase,
    onEndTurn,
    onCloseCards,
    onSetAttackDice,
    onSetFortifyCount,
    onSetHistoryFrameIndex,
    onSetHistoryPlaying,
    onSetOccupyMove,
    onSetPlaceCount,
    onToggleShortcutCheatSheet,
    onToggleHistory,
    onToggleCards,
    onUndoPlacement,
    phase,
    placeCount,
    reinforcementDraftCount,
  ]);
}
