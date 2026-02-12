import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  History,
  Info,
  Layers,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { HistoryScrubber } from "@/components/game/history-scrubber";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
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
  historyFrameIndex: number;
  historyCount: number;
  historyMaxIndex: number;
  historyAtEnd: boolean;
  historyPlaying: boolean;
  onHistoryFrameIndexChange: (updater: (previous: number) => number) => void;
  onToggleHistoryPlaying: () => void;
  onResetHistory: () => void;
  cardsOpenDisabled: boolean;
  myCardCount: number;
  onOpenCards: () => void;
  infoOpen: boolean;
  onToggleInfo: () => void;
  onToggleHistory: () => void;
  historyToggleDisabled: boolean;
  renderHistoryScrubber?: () => ReactNode;
  onConfirmPlacements: () => void;
  onEndAttackPhase: () => void;
  onEndTurn: () => void;
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
  historyFrameIndex,
  historyCount,
  historyMaxIndex,
  historyAtEnd,
  historyPlaying,
  onHistoryFrameIndexChange,
  onToggleHistoryPlaying,
  onResetHistory,
  cardsOpenDisabled,
  myCardCount,
  onOpenCards,
  infoOpen,
  onToggleInfo,
  onToggleHistory,
  historyToggleDisabled,
  renderHistoryScrubber,
  onConfirmPlacements,
  onEndAttackPhase,
  onEndTurn,
}: GameHeaderProps) {
  const showPhaseTitle = historyOpen || !["Reinforcement", "Attack", "Fortify"].includes(displayPhase);

  return (
    <div className="game-header glass-panel relative flex min-h-12 flex-wrap items-center gap-2 px-2 py-1.5">
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
        {!historyOpen && isMyTurn && phase === "Reinforcement" && (
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

      {!historyOpen && !isMyTurn && currentHint && (
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

      {!historyOpen && isMyTurn && phase === "Reinforcement" && (
        <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm">
          <Button
            size="xs"
            type="button"
            variant="outline"
            disabled={controlsDisabled || uncommittedReinforcements <= 0 || placeCount <= 1}
            onClick={onDecreasePlaceCount}
          >
            -
          </Button>
          <span className="inline-flex min-w-8 items-center justify-center rounded border bg-background/80 px-2 py-1 font-semibold">
            {placeCount}
          </span>
          <Button
            size="xs"
            type="button"
            variant="outline"
            disabled={controlsDisabled || uncommittedReinforcements <= 0 || placeCount >= uncommittedReinforcements}
            onClick={onIncreasePlaceCount}
          >
            +
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={controlsDisabled || reinforcementDraftCount === 0}
            onClick={onUndoPlacement}
          >
            Undo
          </Button>
        </div>
      )}

      {displayPhase === "GameOver" && (
        <span className="shrink-0 rounded border bg-background/70 px-2 py-1 text-sm">{winnerName}</span>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {historyOpen && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="xs"
              type="button"
              variant="outline"
              title="Previous frame ([)"
              disabled={historyFrameIndex <= 0}
              onClick={() => onHistoryFrameIndexChange((prev) => Math.max(0, prev - 1))}
            >
              <SkipBack className="size-4" />
            </Button>
            <Button
              size="xs"
              type="button"
              variant="outline"
              title="Play/Pause (P)"
              disabled={historyAtEnd}
              onClick={onToggleHistoryPlaying}
            >
              {historyPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <Button
              size="xs"
              type="button"
              variant="outline"
              title="Next frame (])"
              disabled={historyAtEnd}
              onClick={() => onHistoryFrameIndexChange((prev) => Math.min(historyMaxIndex, prev + 1))}
            >
              <SkipForward className="size-4" />
            </Button>
            <Button size="xs" type="button" variant="outline" title="Reset history (R)" onClick={onResetHistory}>
              Reset
            </Button>
            <span className="rounded border bg-background/70 px-2 py-1 text-xs text-muted-foreground">
              {historyFrameIndex + 1}/{historyCount}
            </span>
          </div>
        )}
        <TooltipProvider>
          {!historyOpen && isMyTurn && phase === "Reinforcement" && (
            <Button
              type="button"
              size="sm"
              title="Confirm placements (Cmd/Ctrl+Enter)"
              disabled={controlsDisabled || reinforcementDraftCount === 0}
              onClick={onConfirmPlacements}
              className="action-cta"
            >
              Confirm
              <ShortcutHint shortcut="mod+enter" />
            </Button>
          )}
          {!historyOpen && isMyTurn && phase === "Attack" && !hasPendingAttack && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              title="End attack phase (Cmd/Ctrl+Enter)"
              disabled={controlsDisabled}
              onClick={onEndAttackPhase}
              className="action-cta"
            >
              End Attack
              <ShortcutHint shortcut="mod+enter" />
            </Button>
          )}
          {!historyOpen && isMyTurn && phase === "Fortify" && (
            <Button
              size="sm"
              variant="outline"
              title="End turn (Cmd/Ctrl+Enter)"
              disabled={controlsDisabled}
              onClick={onEndTurn}
              className="action-cta"
            >
              End Turn
              <ShortcutHint shortcut="mod+enter" />
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
          {historyOpen && (
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label="Open timeline scrubber"
                      className="enabled:cursor-pointer"
                    >
                      <SlidersHorizontal className="size-4" aria-hidden="true" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Timeline scrubber</TooltipContent>
              </Tooltip>
              <PopoverContent align="end" side="bottom" className="w-[min(90vw,420px)] p-3">
                {renderHistoryScrubber ? renderHistoryScrubber() : (
                  <HistoryScrubber min={0} max={historyMaxIndex} value={historyFrameIndex} onChange={() => null} />
                )}
              </PopoverContent>
            </Popover>
          )}
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
        </TooltipProvider>
      </div>
    </div>
  );
}
