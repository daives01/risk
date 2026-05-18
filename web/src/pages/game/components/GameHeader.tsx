import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  History,
  Info,
  Layers,
  Settings,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface GameHeaderProps {
  phaseTitle: string;
  actionHint: string | null;
  historyOpen: boolean;
  isMyTurn: boolean;
  phase: string;
  hasPendingAttack: boolean;
  displayPhase: string;
  uncommittedReinforcements: number;
  fortifyRemainingLabel: string;
  currentTurnPlayerName: string;
  showSignInCta: boolean;
  loginHref: string;
  currentHint: string | null;
  onRotateHintForward: () => void;
  onRotateHintBack: () => void;
  controlsDisabled: boolean;
  placeCount: number;
  reinforcementDraftCount: number;
  onDecreasePlaceCount: () => void;
  onIncreasePlaceCount: () => void;
  onUndoPlacement: () => void;
  winnerName: string;
  cardsOpenDisabled: boolean;
  myCardCount: number;
  onOpenCards: () => void;
  infoOpen: boolean;
  onToggleInfo: () => void;
  onToggleHistory: () => void;
  onOpenSettings: () => void;
  historyToggleDisabled: boolean;
  isMapFullscreen: boolean;
  showBackHome: boolean;
  onConfirmPlacements: () => void;
  onEndAttackPhase: () => void;
  actionButtonsDisabled: boolean;
  onEndTurn: () => void;
  delegatedPlayerName?: string | null;
  onStopDelegation?: () => void;
}

export function GameHeader({
  phaseTitle,
  actionHint,
  historyOpen,
  isMyTurn,
  phase,
  hasPendingAttack,
  displayPhase,
  uncommittedReinforcements,
  fortifyRemainingLabel,
  currentTurnPlayerName,
  showSignInCta,
  loginHref,
  currentHint,
  onRotateHintForward,
  onRotateHintBack,
  controlsDisabled,
  placeCount,
  reinforcementDraftCount,
  onDecreasePlaceCount,
  onIncreasePlaceCount,
  onUndoPlacement,
  winnerName,
  cardsOpenDisabled,
  myCardCount,
  onOpenCards,
  infoOpen,
  onToggleInfo,
  onToggleHistory,
  onOpenSettings,
  historyToggleDisabled,
  isMapFullscreen,
  showBackHome,
  onConfirmPlacements,
  onEndAttackPhase,
  actionButtonsDisabled,
  onEndTurn,
  delegatedPlayerName,
  onStopDelegation,
}: GameHeaderProps) {
  const showPhaseTitle = historyOpen || !["Reinforcement", "Attack", "Fortify"].includes(displayPhase);
  const isPlacementMode =
    phase === "Reinforcement" ||
    (phase === "Attack" && (uncommittedReinforcements > 0 || reinforcementDraftCount > 0));

  return (
    <div className="game-header glass-panel relative flex min-h-12 flex-col overflow-hidden">
      {delegatedPlayerName && (
        <div className="flex min-w-0 items-center justify-between gap-2 border-b border-amber-300/70 bg-amber-500/25 px-2 py-1.5 text-sm text-amber-50">
          <span className="min-w-0 truncate font-semibold">Playing for {delegatedPlayerName}</span>
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="h-6 shrink-0 px-2 text-[11px] uppercase tracking-wide"
            onClick={onStopDelegation}
          >
            Stop
          </Button>
        </div>
      )}

      <div className="flex min-h-12 flex-nowrap items-center gap-1.5 px-2 py-1.5 md:gap-2">
        {showBackHome && (
          <Button asChild size="sm" type="button" variant="outline" title="Back to home" className="hidden md:inline-flex">
            <Link to="/home" aria-label="Back to home">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        )}
        <div className="flex min-w-0 flex-col">
          {showPhaseTitle && (
            <span className="shrink-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {phaseTitle}
            </span>
          )}
          {actionHint && (
            <span className="turn-hint max-w-[min(52vw,260px)] truncate text-xs font-semibold uppercase tracking-wide">
              {actionHint}
            </span>
          )}
          {!historyOpen && isMyTurn && isPlacementMode && (
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{uncommittedReinforcements} left</span>
          )}
          {!historyOpen && isMyTurn && phase === "Fortify" && (
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{fortifyRemainingLabel}</span>
          )}
        </div>

      {!historyOpen && !isMyTurn && displayPhase !== "GameOver" && (
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-muted-foreground">It's {currentTurnPlayerName}'s turn</span>
          {showSignInCta && (
            <Button asChild size="xs" variant="outline">
              <Link to={loginHref}>Sign in</Link>
            </Button>
          )}
        </div>
      )}

      {!historyOpen && !isMyTurn && !showSignInCta && currentHint && (
        <div className="absolute left-1/2 hidden w-[min(60vw,640px)] -translate-x-1/2 items-center justify-center gap-2 text-xs text-muted-foreground md:flex">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Show previous hint"
            className="hint-prev"
            onClick={onRotateHintBack}
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
          </Button>
          <span className="hint-text truncate text-center">{currentHint}</span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Show another hint"
            className="hint-next"
            onClick={onRotateHintForward}
          >
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      {!historyOpen && isMyTurn && isPlacementMode && (
        <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm">
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Undo placement"
            disabled={controlsDisabled || reinforcementDraftCount === 0}
            onClick={onUndoPlacement}
          >
            <Undo2 className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Undo</span>
          </Button>
          <div className="inline-flex h-8 overflow-hidden rounded-md border bg-background/80">
            <span className="inline-flex min-w-9 items-center justify-center px-2 text-sm font-semibold">{placeCount}</span>
            <div className="flex flex-col border-l">
              <button
                type="button"
                aria-label="Increase placement count"
                className="flex h-4 w-6 items-center justify-center border-b hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                disabled={controlsDisabled || uncommittedReinforcements <= 0 || placeCount >= uncommittedReinforcements}
                onClick={onIncreasePlaceCount}
              >
                <ChevronUp className="size-3" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Decrease placement count"
                className="flex h-4 w-6 items-center justify-center hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                disabled={controlsDisabled || uncommittedReinforcements <= 0 || placeCount <= 1}
                onClick={onDecreasePlaceCount}
              >
                <ChevronDown className="size-3" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

      {displayPhase === "GameOver" && (
        <span className="shrink-0 rounded border bg-background/70 px-2 py-1 text-sm">{winnerName}</span>
      )}

      <div className="ml-auto flex flex-nowrap items-center gap-1.5">
        <TooltipProvider>
          {!historyOpen && isMyTurn && isPlacementMode && (
            <Button
              type="button"
              size="sm"
              title="Confirm placements"
              aria-label="Confirm placements"
              disabled={controlsDisabled || actionButtonsDisabled || reinforcementDraftCount === 0}
              onClick={onConfirmPlacements}
              className="action-cta"
            >
              <Check className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Confirm</span>
            </Button>
          )}
          {!historyOpen && isMyTurn && phase === "Attack" && !isPlacementMode && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              title="End attack phase"
              disabled={controlsDisabled || actionButtonsDisabled || hasPendingAttack}
              onClick={onEndAttackPhase}
              className="action-cta"
            >
              End Attack
            </Button>
          )}
          {!historyOpen && isMyTurn && phase === "Fortify" && (
            <Button
              size="sm"
              variant="outline"
              title="End turn"
              disabled={controlsDisabled || actionButtonsDisabled}
              onClick={onEndTurn}
              className="action-cta"
            >
              End Turn
            </Button>
          )}
          {!cardsOpenDisabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  type="button"
                  className="relative enabled:cursor-pointer"
                  aria-label="Open cards"
                  onClick={onOpenCards}
                >
                  <Layers className="size-4" aria-hidden="true" />
                  <span className="absolute -right-1 -top-1 rounded-full border border-border/70 bg-background px-1 text-[10px] font-semibold">
                    {myCardCount}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open cards (C)</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={infoOpen ? "default" : "outline"}
                size="icon-sm"
                type="button"
                aria-label="Toggle map info"
                onClick={onToggleInfo}
                disabled={historyOpen}
                className="enabled:cursor-pointer"
              >
                <Info className="size-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle map info (I)</TooltipContent>
          </Tooltip>
          {!isMapFullscreen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={historyOpen ? "default" : "outline"}
                  size="icon-sm"
                  type="button"
                  aria-label="Toggle history"
                  onClick={onToggleHistory}
                  disabled={historyToggleDisabled}
                  className="enabled:cursor-pointer"
                >
                  <History className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle history (H)</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                type="button"
                aria-label="Open game rules"
                onClick={onOpenSettings}
                className="enabled:cursor-pointer"
              >
                <Settings className="size-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Game rules (G)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      </div>
    </div>
  );
}
