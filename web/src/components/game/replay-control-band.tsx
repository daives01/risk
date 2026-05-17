import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HistoryScrubber } from "@/components/game/history-scrubber";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ReplayControlBandProps {
  className?: string;
  frameIndex: number;
  frameCount: number;
  frameMaxIndex: number;
  atEnd: boolean;
  playing: boolean;
  activeLabel: string | null;
  onFrameIndexChange: (value: number) => void;
  onPreviousFrame: () => void;
  onNextFrame: () => void;
  onTogglePlaying: () => void;
  onJumpSinceLastTurn: () => void;
  onResetToLatest: () => void;
}

export function ReplayControlBand({
  className,
  frameIndex,
  frameCount,
  frameMaxIndex,
  atEnd,
  playing,
  activeLabel,
  onFrameIndexChange,
  onPreviousFrame,
  onNextFrame,
  onTogglePlaying,
  onJumpSinceLastTurn,
  onResetToLatest,
}: ReplayControlBandProps) {
  return (
    <div className={cn("replay-control-band flex min-w-0 flex-col gap-1.5 px-3 py-1.5", className)}>
      <TooltipProvider>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <HistoryScrubber
              min={0}
              max={frameMaxIndex}
              value={frameIndex}
              onChange={onFrameIndexChange}
            />
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(3.5rem,1fr)] items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{activeLabel ?? "Loading replay..."}</span>
          <div className="flex shrink-0 items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-xs" type="button" variant="outline" onClick={onJumpSinceLastTurn}>
                  <SkipBack className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Since my last turn (,)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-xs" type="button" variant="outline" disabled={frameIndex <= 0} onClick={onPreviousFrame}>
                  <StepBack className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous frame (J)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-xs" type="button" variant="outline" disabled={atEnd} onClick={onTogglePlaying}>
                  {playing
                    ? <Pause className="size-3.5" aria-hidden="true" />
                    : <Play className="size-3.5" aria-hidden="true" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Play/Pause (K)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-xs" type="button" variant="outline" disabled={atEnd} onClick={onNextFrame}>
                  <StepForward className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next frame (L)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-xs" type="button" variant="outline" disabled={atEnd} onClick={onResetToLatest}>
                  <SkipForward className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Jump to present (.)</TooltipContent>
            </Tooltip>
          </div>
          <span className="shrink-0 justify-self-end tabular-nums">
            {frameCount === 0 ? "0/0" : `${frameIndex + 1}/${frameCount}`}
          </span>
        </div>
      </TooltipProvider>
    </div>
  );
}
